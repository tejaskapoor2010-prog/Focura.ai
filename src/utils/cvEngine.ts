import { FocusState, VisionDetectionResult } from '../types';

export interface Point {
  x: number;
  y: number;
  z?: number;
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smooth(current: number, target: number, alpha: number): number {
  return current + alpha * (target - current);
}

export interface CVEngineOptions {
  onResult: (result: VisionDetectionResult) => void;
  targetFps?: number;
  sensitivity?: 'low' | 'normal' | 'high';
  phoneDetectionEnabled?: boolean;
  studyMode?: 'screen' | 'book';
}

export class FocusCVEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private isRunning: boolean = false;
  private options: CVEngineOptions;
  private studyMode: 'screen' | 'book' = 'screen';

  // Temporal motion measurement
  private motion: number = 0;
  private priorGray: Uint8Array | null = null;
  private priorW: number = 0;
  private priorH: number = 0;
  private phoneCanvas?: HTMLCanvasElement;
  private motionCanvas?: HTMLCanvasElement;

  private get yaw(): number {
    return this.smoothedYaw;
  }

  private get pitch(): number {
    return this.smoothedPitch;
  }

  private get roll(): number {
    return this.smoothedRoll;
  }

  private get sensitivity(): 'low' | 'normal' | 'high' {
    return this.options.sensitivity || 'normal';
  }

  private threshold(low: number, normal: number, high: number): number {
    return this.sensitivity === 'low' ? low : this.sensitivity === 'high' ? high : normal;
  }

  // Smoothing buffers (Exponential Moving Average)
  private smoothedYaw: number = 0;
  private smoothedPitch: number = 0;
  private smoothedRoll: number = 0;
  private smoothedScore: number = 100;
  private smoothedEyeOpenness: number = 0.85;
  private smoothedIrisGazeY: number = 0.5;

  // Exponential Moving Average filter on raw estimatePose output to eliminate jittering
  private emaPoseYaw: number = 0;
  private emaPosePitch: number = 0;
  private emaPoseRoll: number = 0;
  private emaPoseInitialized: boolean = false;


  // Baseline calibration (eliminates false positives from chair/camera angles)
  private baselinePitch: number = 0;
  private baselineYaw: number = 0;
  private isCalibrating: boolean = false;
  private calibrationFrames: number = 0;
  private calibrationSumPitch: number = 0;
  private calibrationSumYaw: number = 0;
  private autoCalibrationDone: boolean = false;
  private autoCalibrationFrameCount: number = 0;

  // Hysteresis counters to prevent flickering between frames
  private consecutiveAbsentFrames: number = 0;
  private consecutiveLookingAwayFrames: number = 0;
  private consecutivePhoneFrames: number = 0;
  private consecutiveDrowsyFrames: number = 0;
  private consecutiveFocusedFrames: number = 0;

  private currentState: FocusState = 'focused';
  private lastDistractionDetail: string = '';
  private lastFrameTimestamp: number = 0;
  private frameInterval: number = 1000 / 20; // 20 FPS

  // MediaPipe FaceLandmarker
  private mediaPipeLandmarker: any = null;
  private isMediaPipeReady: boolean = false;

  // Reusable offscreen canvas for fallback & phone/hand region analysis (prevents GC lag)
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D | null;

  constructor(options: CVEngineOptions) {
    this.options = {
      targetFps: 20,
      sensitivity: 'normal',
      phoneDetectionEnabled: true,
      studyMode: 'screen',
      ...options,
    };
    this.studyMode = this.options.studyMode || 'screen';
    this.frameInterval = 1000 / (this.options.targetFps || 20);

    // Create reusable offscreen canvas once
    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = 160;
    this.offCanvas.height = 120;
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });

    this.initMediaPipe();
  }

  /**
   * Initializes MediaPipe Face Landmarker from Google CDN for high-precision 3D mesh.
   */
  private async initMediaPipe() {
    try {
      if (typeof window !== 'undefined' && !(window as any).faceLandmarkerInstance) {
        const dynamicImport = new Function('url', 'return import(url)');
        const vision = await dynamicImport('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        this.mediaPipeLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        (window as any).faceLandmarkerInstance = this.mediaPipeLandmarker;
        this.isMediaPipeReady = true;
      } else if ((window as any).faceLandmarkerInstance) {
        this.mediaPipeLandmarker = (window as any).faceLandmarkerInstance;
        this.isMediaPipeReady = true;
      }
    } catch {
      // Graceful fallback to built-in optical face tracker
      this.isMediaPipeReady = false;
    }
  }

  public setSensitivity(sensitivity: 'low' | 'normal' | 'high') {
    this.options.sensitivity = sensitivity;
  }

  public setPhoneDetectionEnabled(enabled: boolean) {
    this.options.phoneDetectionEnabled = enabled;
  }

  public setStudyMode(mode: 'screen' | 'book') {
    this.studyMode = mode;
    this.options.studyMode = mode;
  }

  /**
   * Triggers explicit posture calibration (records neutral head position)
   */
  public calibrate() {
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    this.calibrationSumPitch = 0;
    this.calibrationSumYaw = 0;
  }

  public isCalibrated(): boolean {
    return this.autoCalibrationDone;
  }

  public start(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement) {
    this.videoElement = video;
    this.canvasElement = overlayCanvas;
    this.canvas = overlayCanvas;
    this.ctx = overlayCanvas.getContext('2d');
    this.isRunning = true;
    this.consecutiveAbsentFrames = 0;
    this.consecutiveFocusedFrames = 0;
    this.smoothedScore = 100;
    this.currentState = 'focused';
    this.autoCalibrationDone = false;
    this.autoCalibrationFrameCount = 0;
    this.emaPoseInitialized = false;
    this.motion = 0;
    this.priorGray = null;

    this.processLoop(performance.now());
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.canvasElement) {
      const ctx = this.canvasElement.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      }
    }
  }

  private processLoop = (timestamp: number) => {
    if (!this.isRunning) return;

    const delta = timestamp - this.lastFrameTimestamp;
    if (delta >= this.frameInterval) {
      this.lastFrameTimestamp = timestamp;
      this.processCurrentFrame(timestamp);
    }

    this.animFrameId = requestAnimationFrame(this.processLoop);
  };

  private processCurrentFrame(timestamp: number) {
    if (!this.videoElement || this.videoElement.readyState < 2) return;
    const video = this.videoElement;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    if (this.canvasElement) {
      if (this.canvasElement.width !== width || this.canvasElement.height !== height) {
        this.canvasElement.width = width;
        this.canvasElement.height = height;
        if (this.canvas) {
          this.canvas.width = width;
          this.canvas.height = height;
        }
      }
    }

    // Measure temporal motion energy between consecutive video frames
    this.measureMotion(video);

    let result: VisionDetectionResult;

    // Use MediaPipe when ready; only fall back if not ready or on error
    if (this.isMediaPipeReady && this.mediaPipeLandmarker) {
      try {
        const mpResult = this.mediaPipeLandmarker.detectForVideo(video, timestamp);
        if (mpResult && mpResult.faceLandmarks && mpResult.faceLandmarks.length > 0) {
          result = this.analyzeMediaPipeLandmarks(mpResult.faceLandmarks[0], width, height, video);
        } else {
          result = this.handleNoFaceDetected();
        }
      } catch {
        result = this.runFallbackCVTracker(video, width, height);
      }
    } else {
      result = this.runFallbackCVTracker(video, width, height);
    }

    // Attach motion energy to result
    result.motionLevel = Number(this.motion.toFixed(3));

    // Apply temporal hysteresis to prevent spurious jumping
    this.applyHysteresisSmoothing(result);

    // Draw HUD on canvas using integrated drawing pipeline
    if (this.canvasElement) {
      this.draw(result, width, height);
    }

    // Notify caller
    this.options.onResult(result);
  }

  /**
   * Check for phone usage clues:
   * 1. Hand holding phone in lower chest quadrant
   * 2. Phone / hand raised to ear
   */
  private detectPhonePhysicalSignals(
    video: HTMLVideoElement,
    faceBox: { x: number; y: number; width: number; height: number },
    width: number,
    height: number,
    rollAngle: number
  ): { phoneDetected: boolean; reason: string } {
    if (!this.options.phoneDetectionEnabled || !this.offCtx) {
      return { phoneDetected: false, reason: '' };
    }

    // Check Phone Call posture: Head tilted sideways with hand/object near ear
    const absRoll = Math.abs(rollAngle);
    if (absRoll > 15) {
      return {
        phoneDetected: true,
        reason: '📱 Phone Call / Device at Ear Detected',
      };
    }

    // In Book Reading Mode: Lower desk area hands are reading/writing/turning pages, NOT phone distraction!
    if (this.studyMode === 'book') {
      return { phoneDetected: false, reason: '' };
    }

    // Analyze lower central zone (bottom 35% of frame) for hand/device presence (Screen Mode only)
    try {
      this.offCtx.drawImage(video, 0, 0, 160, 120);
      const imgData = this.offCtx.getImageData(0, 0, 160, 120);
      const data = imgData.data;

      let lowerHandSkinPixels = 0;
      let lowerDarkDevicePixels = 0;
      let lowerBrightScreenPixels = 0;

      // Scan bottom 35% of video (y from 78 to 118, x from 30 to 130)
      for (let y = 80; y < 118; y += 2) {
        for (let x = 35; x < 125; x += 2) {
          const idx = (y * 160 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Skin tone check
          const isSkin =
            r > 75 && g > 45 && b > 25 &&
            r > g && r > b &&
            (r - g) > 10 &&
            (Math.max(r, g, b) - Math.min(r, g, b)) > 15;

          if (isSkin) lowerHandSkinPixels++;

          // Dark phone body or screen check
          if (r < 35 && g < 35 && b < 35) lowerDarkDevicePixels++;

          // Illuminated screen glow check in hands
          if (r > 200 && g > 200 && b > 200) lowerBrightScreenPixels++;
        }
      }

      // If hands are holding a device in the lower area (hands raised + device body)
      if (lowerHandSkinPixels > 25 && (lowerDarkDevicePixels > 20 || lowerBrightScreenPixels > 15)) {
        return {
          phoneDetected: true,
          reason: '📱 Smartphone Active in Hands',
        };
      }
    } catch {
      // Ignore sampling errors
    }

    return { phoneDetected: false, reason: '' };
  }

  /**
   * High-accuracy analysis using MediaPipe landmarks (478 3D points)
   */
  private analyzeMediaPipeLandmarks(
    landmarks: Array<{ x: number; y: number; z: number }>,
    width: number,
    height: number,
    video: HTMLVideoElement
  ): VisionDetectionResult {
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    // Compute bounding box
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 0; i < landmarks.length; i += 8) {
      const p = landmarks[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const faceBox = {
      x: Math.max(0, minX * width - 10),
      y: Math.max(0, minY * height - 10),
      width: Math.min(width, (maxX - minX) * width + 20),
      height: Math.min(height, (maxY - minY) * height + 20),
    };

    // 3D Head Pose estimation (Yaw, Pitch, Roll) using MediaPipe mesh topology
    const pose = this.estimatePose(landmarks as Point[]);
    const rawYaw = pose.yaw;
    const rawPitch = pose.pitch;
    const rawRoll = pose.roll;

    // Dual-eye Aspect Ratio (EAR) openness estimation
    const eyeOpenness = this.estimateEyeOpenness(landmarks as Point[]);

    // Iris gaze downward estimation (Landmark 468 left iris, 473 right iris)
    let irisGazeDown = 0.5;
    if (landmarks[468] && landmarks[473]) {
      const leftIrisY = landmarks[468].y;
      const leftEyeTopY = landmarks[159].y;
      const leftEyeBotY = landmarks[145].y;
      const eyeH = Math.abs(leftEyeBotY - leftEyeTopY) || 0.01;
      irisGazeDown = (leftIrisY - leftEyeTopY) / eyeH; // > 0.65 means gazing down
    }

    // Auto-calibration: During first 25 frames, smoothly learn student's neutral posture
    if (!this.autoCalibrationDone) {
      this.autoCalibrationFrameCount++;
      if (this.autoCalibrationFrameCount === 1) {
        this.baselinePitch = rawPitch;
        this.baselineYaw = rawYaw;
      } else {
        this.baselinePitch = 0.85 * this.baselinePitch + 0.15 * rawPitch;
        this.baselineYaw = 0.85 * this.baselineYaw + 0.15 * rawYaw;
      }

      if (this.autoCalibrationFrameCount >= 25) {
        this.autoCalibrationDone = true;
      }
    }

    // Manual calibration mode
    if (this.isCalibrating) {
      this.calibrationFrames++;
      this.calibrationSumPitch += rawPitch;
      this.calibrationSumYaw += rawYaw;

      if (this.calibrationFrames >= 15) {
        this.baselinePitch = this.calibrationSumPitch / this.calibrationFrames;
        this.baselineYaw = this.calibrationSumYaw / this.calibrationFrames;
        this.isCalibrating = false;
        this.autoCalibrationDone = true;
      }
    }

    // Smooth with EMA
    const alpha = 0.28;
    this.smoothedYaw = alpha * rawYaw + (1 - alpha) * this.smoothedYaw;
    this.smoothedPitch = alpha * rawPitch + (1 - alpha) * this.smoothedPitch;
    this.smoothedRoll = alpha * rawRoll + (1 - alpha) * this.smoothedRoll;
    this.smoothedEyeOpenness = alpha * eyeOpenness + (1 - alpha) * this.smoothedEyeOpenness;
    this.smoothedIrisGazeY = alpha * irisGazeDown + (1 - alpha) * this.smoothedIrisGazeY;

    // Relative posture angles against neutral calibrated baseline
    const relativePitch = this.smoothedPitch - this.baselinePitch;
    const relativeYaw = this.smoothedYaw - this.baselineYaw;
    const absYaw = Math.abs(relativeYaw);

    // Check physical phone presence (hand to ear / hands holding device / dark edge texture)
    const phoneSignals = this.detectPhonePhysicalSignals(video, faceBox, width, height, this.smoothedRoll);
    if (this.options.phoneDetectionEnabled && this.studyMode !== 'book') {
      const handsetNearFace = this.phoneTextureNearFace(video, faceBox, width, height);
      if (handsetNearFace) {
        phoneSignals.phoneDetected = true;
        phoneSignals.reason = '📱 Smartphone Active in Hands / Near Face';
      }
    }

    // Dynamic thresholds based on sensitivity
    const pitchPhoneThreshold = this.threshold(14, 10.5, 8);
    const yawDistractionThreshold = this.threshold(22, 17, 14);

    let state: FocusState = 'focused';
    let distractionReason = '';
    let targetScore = 100;

    if (this.smoothedEyeOpenness < 0.25) {
      state = 'drowsy';
      distractionReason = 'Eyes closed / Drowsiness';
      targetScore = 20;
    } else if (this.studyMode === 'book') {
      // 📖 PHYSICAL BOOK / NOTES READING MODE:
      // Looking down at desk, book, or paper is 100% normal & focused!
      // Phone posture will NOT trigger on downward head pitch or downward gaze.
      if (phoneSignals.phoneDetected && Math.abs(this.smoothedRoll) > 15) {
        state = 'phone_posture';
        distractionReason = phoneSignals.reason;
        targetScore = 25;
      } else if (absYaw > (yawDistractionThreshold + 6)) {
        state = 'looking_away';
        distractionReason = `Looking away to the ${relativeYaw > 0 ? 'Right' : 'Left'} (${Math.round(absYaw)}°)`;
        targetScore = 40;
      } else {
        // High focus whether looking down at the book or centered
        state = 'focused';
        targetScore = Math.max(90, 100 - absYaw * 0.9);
      }
    } else {
      // 💻 SCREEN / DIGITAL STUDY MODE:
      // Looking straight at the screen is focused.
      // Looking down indicates looking at a phone or desk distraction.
      if (phoneSignals.phoneDetected && (relativePitch > 5 || this.smoothedIrisGazeY > 0.6 || Math.abs(this.smoothedRoll) > 13)) {
        state = 'phone_posture';
        distractionReason = phoneSignals.reason;
        targetScore = 25;
      } else if (relativePitch > pitchPhoneThreshold || (relativePitch > 6 && this.smoothedIrisGazeY > 0.68)) {
        state = 'phone_posture';
        distractionReason = 'Looking down (Smartphone / Screen Distraction)';
        targetScore = 35;
      } else if (absYaw > yawDistractionThreshold) {
        state = 'looking_away';
        distractionReason = `Looking away to the ${relativeYaw > 0 ? 'Right' : 'Left'} (${Math.round(absYaw)}°)`;
        targetScore = 40;
      } else {
        state = 'focused';
        targetScore = Math.max(85, 100 - absYaw * 1.3 - Math.abs(relativePitch) * 1.2);
      }
    }

    // Temporal motion energy check: penalize severe restlessness or leaving seat
    if (state === 'focused' && this.motion > this.threshold(0.48, 0.40, 0.32)) {
      targetScore = Math.max(55, targetScore - 25);
      distractionReason = 'Excessive Body Movement / Restlessness';
    }

    this.smoothedScore = alpha * targetScore + (1 - alpha) * this.smoothedScore;

    // Key facial points for HUD
    const hudPoints: { x: number; y: number }[] = [
      { x: nose.x * width, y: nose.y * height },
      { x: leftEye.x * width, y: leftEye.y * height },
      { x: rightEye.x * width, y: rightEye.y * height },
      { x: chin.x * width, y: chin.y * height },
      { x: forehead.x * width, y: forehead.y * height },
      { x: landmarks[61].x * width, y: landmarks[61].y * height },
      { x: landmarks[291].x * width, y: landmarks[291].y * height },
    ];

    return {
      hasFace: true,
      state,
      stateConfidence: 0.95,
      yawAngle: Math.round(relativeYaw),
      pitchAngle: Math.round(relativePitch),
      rollAngle: Math.round(this.smoothedRoll),
      eyeOpenness: this.smoothedEyeOpenness,
      faceBox,
      landmarks: hudPoints,
      focusScoreRealtime: Math.round(this.smoothedScore),
      distractionReason,
    };
  }

  /**
   * Fallback computer vision algorithm using reusable offscreen canvas.
   * Chromatic skin distribution + face aspect tracking.
   */
  private runFallbackCVTracker(video: HTMLVideoElement, width: number, height: number): VisionDetectionResult {
    if (!this.offCtx) {
      return this.handleNoFaceDetected();
    }

    this.offCtx.drawImage(video, 0, 0, 160, 120);
    const imgData = this.offCtx.getImageData(0, 0, 160, 120);
    const data = imgData.data;

    let skinPixelCount = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = 160, maxX = 0, minY = 120, maxY = 0;

    for (let y = 0; y < 120; y += 2) {
      for (let x = 0; x < 160; x += 2) {
        const idx = (y * 160 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const isSkin =
          r > 70 && g > 40 && b > 20 &&
          r > g && r > b &&
          (r - g) > 10 &&
          Math.abs(r - g) > 12 &&
          (Math.max(r, g, b) - Math.min(r, g, b)) > 15;

        if (isSkin) {
          skinPixelCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (skinPixelCount < 90 || (maxX - minX) < 18 || (maxY - minY) < 18) {
      return this.handleNoFaceDetected();
    }

    const scaleX = width / 160;
    const scaleY = height / 120;

    const centerX = (sumX / skinPixelCount) * scaleX;
    const centerY = (sumY / skinPixelCount) * scaleY;

    const faceBox = {
      x: Math.max(0, minX * scaleX - 15),
      y: Math.max(0, minY * scaleY - 15),
      width: Math.min(width, (maxX - minX + 20) * scaleX),
      height: Math.min(height, (maxY - minY + 20) * scaleY),
    };

    // Calculate normalized horizontal offset from camera optical center
    const screenCenterOffsetX = (centerX - width / 2) / (width / 2);
    const rawYaw = screenCenterOffsetX * 35;

    // Face aspect ratio and vertical centroid
    const faceW = faceBox.width;
    const faceH = faceBox.height;
    const faceRatio = faceH / (faceW || 1); // Tilting down compresses apparent height

    // Auto-calibration for fallback
    if (!this.autoCalibrationDone) {
      this.autoCalibrationFrameCount++;
      if (this.autoCalibrationFrameCount === 1) {
        this.baselinePitch = centerY;
        this.baselineYaw = rawYaw;
      } else {
        this.baselinePitch = 0.85 * this.baselinePitch + 0.15 * centerY;
        this.baselineYaw = 0.85 * this.baselineYaw + 0.15 * rawYaw;
      }
      if (this.autoCalibrationFrameCount >= 25) {
        this.autoCalibrationDone = true;
      }
    }

    const relativeY = centerY - this.baselinePitch;
    const rawPitch = (relativeY / (height * 0.25)) * 25 + (faceRatio < 1.15 ? 8 : 0);

    const alpha = 0.25;
    this.smoothedYaw = alpha * rawYaw + (1 - alpha) * this.smoothedYaw;
    this.smoothedPitch = alpha * rawPitch + (1 - alpha) * this.smoothedPitch;
    this.smoothedEyeOpenness = 0.85;

    const relativePitch = this.smoothedPitch;
    const relativeYaw = this.smoothedYaw - this.baselineYaw;
    const absYaw = Math.abs(relativeYaw);

    const phoneSignals = this.detectPhonePhysicalSignals(video, faceBox, width, height, 0);

    const sens = this.options.sensitivity || 'normal';
    const pitchPhoneThreshold = sens === 'high' ? 8 : sens === 'low' ? 15 : 11;
    const yawThreshold = sens === 'high' ? 14 : sens === 'low' ? 22 : 17;

    let state: FocusState = 'focused';
    let distractionReason = '';
    let targetScore = 100;

    if (this.studyMode === 'book') {
      if (phoneSignals.phoneDetected) {
        state = 'phone_posture';
        distractionReason = phoneSignals.reason;
        targetScore = 25;
      } else if (absYaw > (yawThreshold + 6)) {
        state = 'looking_away';
        distractionReason = `Looking away to the ${relativeYaw > 0 ? 'Right' : 'Left'}`;
        targetScore = 45;
      } else {
        // Looking down at book or straight is focused
        state = 'focused';
        targetScore = Math.max(90, 100 - absYaw * 0.9);
      }
    } else {
      if (phoneSignals.phoneDetected && relativePitch > 4) {
        state = 'phone_posture';
        distractionReason = phoneSignals.reason;
        targetScore = 25;
      } else if (relativePitch > pitchPhoneThreshold) {
        state = 'phone_posture';
        distractionReason = 'Head tilted down (Looking at smartphone or desk)';
        targetScore = 38;
      } else if (absYaw > yawThreshold) {
        state = 'looking_away';
        distractionReason = `Looking away to the ${relativeYaw > 0 ? 'Right' : 'Left'}`;
        targetScore = 45;
      } else {
        state = 'focused';
        targetScore = Math.max(85, 100 - absYaw * 1.3 - Math.abs(relativePitch) * 1.1);
      }
    }

    this.smoothedScore = alpha * targetScore + (1 - alpha) * this.smoothedScore;

    const hudPoints = [
      { x: centerX, y: centerY },
      { x: centerX - faceBox.width * 0.22, y: centerY - faceBox.height * 0.12 },
      { x: centerX + faceBox.width * 0.22, y: centerY - faceBox.height * 0.12 },
      { x: centerX, y: centerY + faceBox.height * 0.2 },
    ];

    return {
      hasFace: true,
      state,
      stateConfidence: 0.88,
      yawAngle: Math.round(relativeYaw),
      pitchAngle: Math.round(relativePitch),
      rollAngle: 0,
      eyeOpenness: 0.85,
      faceBox,
      landmarks: hudPoints,
      focusScoreRealtime: Math.round(this.smoothedScore),
      distractionReason,
    };
  }

  private handleNoFaceDetected(): VisionDetectionResult {
    this.smoothedScore = 0.15 * 0 + 0.85 * this.smoothedScore;

    return {
      hasFace: false,
      state: 'absent',
      stateConfidence: 0.98,
      yawAngle: 0,
      pitchAngle: 0,
      rollAngle: 0,
      eyeOpenness: 0,
      focusScoreRealtime: Math.max(0, Math.round(this.smoothedScore)),
      distractionReason: 'Student absent from study area',
    };
  }

  /**
   * Hysteresis prevents flickering between states
   */
  private applyHysteresisSmoothing(result: VisionDetectionResult) {
    if (!result.hasFace) {
      this.consecutiveAbsentFrames++;
      this.consecutiveFocusedFrames = 0;
      this.consecutiveLookingAwayFrames = 0;
      this.consecutivePhoneFrames = 0;

      if (this.consecutiveAbsentFrames >= 7) {
        this.currentState = 'absent';
        this.lastDistractionDetail = result.distractionReason || 'Absent from study desk';
      }
    } else if (result.state === 'phone_posture') {
      this.consecutivePhoneFrames++;
      this.consecutiveFocusedFrames = 0;
      this.consecutiveAbsentFrames = 0;
      this.consecutiveLookingAwayFrames = 0;

      // Phone posture confirmed after 4 consecutive frames (~200ms) for rock-solid stability
      if (this.consecutivePhoneFrames >= 4) {
        this.currentState = 'phone_posture';
        this.lastDistractionDetail = result.distractionReason || '📱 Smartphone detected';
      }
    } else if (result.state === 'looking_away') {
      this.consecutiveLookingAwayFrames++;
      this.consecutiveFocusedFrames = 0;
      this.consecutiveAbsentFrames = 0;
      this.consecutivePhoneFrames = 0;

      if (this.consecutiveLookingAwayFrames >= 5) {
        this.currentState = 'looking_away';
        this.lastDistractionDetail = result.distractionReason || 'Looking away';
      }
    } else if (result.state === 'drowsy') {
      this.consecutiveDrowsyFrames++;
      if (this.consecutiveDrowsyFrames >= 6) {
        this.currentState = 'drowsy';
        this.lastDistractionDetail = 'Drowsy / Eyes closed';
      }
    } else {
      this.consecutiveFocusedFrames++;
      this.consecutiveAbsentFrames = 0;
      this.consecutiveLookingAwayFrames = 0;
      this.consecutivePhoneFrames = 0;
      this.consecutiveDrowsyFrames = 0;

      if (this.consecutiveFocusedFrames >= 4) {
        this.currentState = 'focused';
        this.lastDistractionDetail = '';
      }
    }

    result.state = this.currentState;
    if (this.currentState !== 'focused' && this.lastDistractionDetail) {
      result.distractionReason = this.lastDistractionDetail;
    }
  }

  /**
   * Visual HUD overlay rendering on the un-mirrored canvas.
   * Mirrors X coordinates so bounding reticle and landmarks overlay the mirrored video,
   * while text is drawn normal (NOT backwards/mirror flipped)!
   */
  private renderHUD(result: VisionDetectionResult, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isFocused = result.state === 'focused';
    const isPhone = result.state === 'phone_posture';
    const isAway = result.state === 'looking_away';
    const isAbsent = result.state === 'absent';
    const isDrowsy = result.state === 'drowsy';

    let primaryColor = '#FFFFFF'; // Crisp White
    let accentBg = 'rgba(255, 255, 255, 0.08)';

    if (isPhone) {
      primaryColor = '#FFFFFF'; // White with prominent alert
      accentBg = 'rgba(255, 255, 255, 0.16)';
    } else if (isAway) {
      primaryColor = '#D4D4D8'; // Zinc-300
      accentBg = 'rgba(212, 212, 216, 0.1)';
    } else if (isAbsent || isDrowsy) {
      primaryColor = '#A1A1AA'; // Zinc-400
      accentBg = 'rgba(161, 161, 170, 0.1)';
    }

    // Active calibration banner in sleek monochrome
    if (this.isCalibrating || !this.autoCalibrationDone) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 130, 12, 260, 26, 6);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const pct = Math.min(100, Math.round((this.autoCalibrationFrameCount / 25) * 100));
      ctx.fillText(`CALIBRATING NEUTRAL POSTURE · ${pct}%`, canvas.width / 2, 29);
    }

    // If absent, render clean radar
    if (isAbsent || !result.faceBox) {
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = Math.min(canvas.width, canvas.height) * 0.22;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = primaryColor;
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STUDY DESK EMPTY · LOOKING FOR STUDENT', cx, cy + r + 24);
      return;
    }

    const { x: rawX, y, width: bw, height: bh } = result.faceBox;
    // Mirror X coordinate so it aligns with mirrored video (-scale-x-100)
    const drawX = canvas.width - (rawX + bw);
    const cornerSize = Math.min(26, bw * 0.22);

    // Reticle corners
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(drawX, y + cornerSize);
    ctx.lineTo(drawX, y);
    ctx.lineTo(drawX + cornerSize, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, y);
    ctx.lineTo(drawX + bw, y);
    ctx.lineTo(drawX + bw, y + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(drawX, y + bh - cornerSize);
    ctx.lineTo(drawX, y + bh);
    ctx.lineTo(drawX + cornerSize, y + bh);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, y + bh);
    ctx.lineTo(drawX + bw, y + bh);
    ctx.lineTo(drawX + bw, y + bh - cornerSize);
    ctx.stroke();

    // Subtle box fill
    ctx.fillStyle = accentBg;
    ctx.fillRect(drawX, y, bw, bh);

    // Mirrored facial landmarks
    if (result.landmarks && result.landmarks.length > 0) {
      ctx.fillStyle = primaryColor;
      for (const pt of result.landmarks) {
        const mirroredPtX = canvas.width - pt.x;
        ctx.beginPath();
        ctx.arc(mirroredPtX, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Top-right mode tag in monochrome
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    const modeTagWidth = this.studyMode === 'book' ? 140 : 130;
    ctx.beginPath();
    ctx.roundRect(canvas.width - modeTagWidth - 10, 10, modeTagWidth, 22, 4);
    ctx.fill();
    ctx.strokeStyle = '#52525B';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.studyMode === 'book' ? '📖 BOOK / NOTES MODE' : '💻 SCREEN MODE',
      canvas.width - modeTagWidth / 2 - 10,
      24
    );

    // Top label badge on face box (rendered forward in normal English)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    const isReadingBook = this.studyMode === 'book' && result.state === 'focused';
    const tagWidth = isPhone ? 180 : isReadingBook ? 175 : 150;
    const tagHeight = 24;
    const badgeX = Math.max(6, Math.min(canvas.width - tagWidth - 6, drawX));
    const badgeY = Math.max(6, y - 28);

    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, tagWidth, tagHeight, 5);
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = primaryColor;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    let stateLabel = '● FOCUS OPTIMAL';
    if (result.state === 'focused') {
      stateLabel = this.studyMode === 'book'
        ? (result.pitchAngle > 2 ? '📖 READING BOOK / NOTES' : '● DESK FOCUS OPTIMAL')
        : '● SCREEN FOCUS OPTIMAL';
    } else if (result.state === 'phone_posture') {
      stateLabel = '📱 PHONE DETECTED';
    } else if (result.state === 'looking_away') {
      stateLabel = '▲ LOOKING AWAY';
    } else if (result.state === 'drowsy') {
      stateLabel = '✖ DROWSY';
    } else {
      stateLabel = '✖ ABSENT';
    }

    ctx.fillText(stateLabel, badgeX + 8, badgeY + 16);

    // Bottom telemetry bar: Pitch, Yaw & Quality score
    const telemetryY = y + bh + 14;
    if (telemetryY < canvas.height - 12) {
      const barWidth = Math.max(bw, 180);
      const barX = Math.max(6, Math.min(canvas.width - barWidth - 6, drawX));

      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.roundRect(barX, telemetryY, barWidth, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#D4D4D8';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText(`PITCH: ${result.pitchAngle > 0 ? '+' : ''}${result.pitchAngle}°  YAW: ${result.yawAngle > 0 ? '+' : ''}${result.yawAngle}°  SCORE: ${result.focusScoreRealtime}%`, barX + 6, telemetryY + 14);
    }
  }

  private estimatePose(p: Point[]): { yaw: number; pitch: number; roll: number } {
    // Face mesh indices follow the MediaPipe Face Landmarker topology.
    const left = p[33],
      right = p[263],
      nose = p[1],
      forehead = p[10],
      chin = p[152];
    const eyeMidX = (left.x + right.x) / 2,
      eyeMidY = (left.y + right.y) / 2;
    const width = Math.max(0.001, distance(left, right));
    const rawYaw = clamp(((nose.x - eyeMidX) / width) * 110, -90, 90);
    const vertical = (nose.y - eyeMidY) / Math.max(0.001, chin.y - forehead.y);
    const rawPitch = clamp((vertical - 0.34) * 155, -90, 90);
    const rawRoll = clamp((Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI, -45, 45);

    // Exponential Moving Average (EMA) filter on estimatePose to eliminate jittering
    if (!this.emaPoseInitialized) {
      this.emaPoseYaw = rawYaw;
      this.emaPosePitch = rawPitch;
      this.emaPoseRoll = rawRoll;
      this.emaPoseInitialized = true;
    } else {
      // Adaptive alpha: tight filtering (alpha ~ 0.22) during small head motions to eliminate jitter,
      // faster adaptation (alpha ~ 0.45) when deliberately turning head
      const deltaMag = Math.hypot(rawYaw - this.emaPoseYaw, rawPitch - this.emaPosePitch);
      const alpha = deltaMag > 12 ? 0.45 : 0.22;
      this.emaPoseYaw = this.emaPoseYaw + alpha * (rawYaw - this.emaPoseYaw);
      this.emaPosePitch = this.emaPosePitch + alpha * (rawPitch - this.emaPosePitch);
      this.emaPoseRoll = this.emaPoseRoll + alpha * (rawRoll - this.emaPoseRoll);
    }

    return { yaw: this.emaPoseYaw, pitch: this.emaPosePitch, roll: this.emaPoseRoll };
  }

  private estimateEyeOpenness(p: Point[]): number {
    const ear = (ids: number[]) => {
      const [a, b, c, d, e, f] = ids.map((i) => p[i]);
      return (distance(b, f) + distance(c, e)) / (2 * Math.max(0.001, distance(a, d)));
    };
    const value = (ear([33, 160, 158, 133, 153, 144]) + ear([362, 385, 387, 263, 373, 380])) / 2;
    return clamp((value - 0.1) / 0.2, 0, 1);
  }

  private phoneTextureNearFace(
    v: HTMLVideoElement,
    box: VisionDetectionResult['faceBox'],
    vw: number,
    vh: number
  ): boolean {
    if (!box) return false;
    const targetCanvas = this.canvas || this.canvasElement;
    if (!targetCanvas) return false;
    const c = this.phoneCanvas ?? (this.phoneCanvas = document.createElement('canvas'));
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    // Inspect a modest region below the face for a dark, compact, edge-rich handset-shaped object.
    const x = clamp((box.x / targetCanvas.width) * vw, 0, vw - 1);
    const y = clamp(((box.y + box.height * 0.7) / targetCanvas.height) * vh, 0, vh - 1);
    const w = Math.min(vw - x, (box.width / targetCanvas.width) * vw * 1.5);
    const h = Math.min(vh - y, (box.height / targetCanvas.height) * vh * 1.25);
    if (w < 8 || h < 8) return false;
    try {
      ctx.drawImage(v, x, y, w, h, 0, 0, 96, 96);
    } catch {
      return false;
    }
    const d = ctx.getImageData(0, 0, 96, 96).data;
    let dark = 0,
      edges = 0;
    for (let yy = 2; yy < 94; yy += 2) {
      for (let xx = 2; xx < 94; xx += 2) {
        const i = (yy * 96 + xx) * 4;
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (lum < 72) dark++;
        const j = i + 96 * 4,
          k = i + 4;
        if (
          Math.abs(lum - (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114)) > 38 &&
          Math.abs(lum - (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114)) > 38
        ) {
          edges++;
        }
      }
    }
    const fraction = dark / 2304;
    return fraction > 0.1 && fraction < 0.68 && edges > 36;
  }

  private measureMotion(v: HTMLVideoElement): number {
    const w = 32,
      h = 24;
    const scratch = this.motionCanvas ?? (this.motionCanvas = document.createElement('canvas'));
    scratch.width = w;
    scratch.height = h;
    const c = scratch.getContext('2d', { willReadFrequently: true });
    if (!c) return 0;
    try {
      c.drawImage(v, 0, 0, w, h);
    } catch {
      return 0;
    }
    const rgba = c.getImageData(0, 0, w, h).data,
      gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (rgba[i * 4] * 3 + rgba[i * 4 + 1] * 6 + rgba[i * 4 + 2]) / 10;
    }
    let sum = 0;
    if (this.priorGray && this.priorW === w && this.priorH === h) {
      for (let i = 0; i < gray.length; i++) {
        sum += Math.abs(gray[i] - this.priorGray[i]);
      }
    }
    this.priorGray = gray;
    this.priorW = w;
    this.priorH = h;
    const instantaneousMotion = this.priorGray ? sum / (gray.length * 255) : 0;
    this.motion = smooth(this.motion, instantaneousMotion, 0.35);
    return this.motion;
  }

  private draw(r: VisionDetectionResult, vw: number, vh: number): void {
    const c = this.canvas || this.canvasElement;
    if (!c) return;
    const ctx = this.ctx || c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    // Active calibration banner if calibrating
    if (this.isCalibrating || !this.autoCalibrationDone) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.beginPath();
      ctx.roundRect(c.width / 2 - 130, 12, 260, 26, 6);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.textAlign = 'center';
      const pct = Math.min(100, Math.round((this.autoCalibrationFrameCount / 25) * 100));
      ctx.fillText(`CALIBRATING POSTURE · ${pct}%`, c.width / 2, 29);
      ctx.textAlign = 'left';
    }

    const active = r.state !== 'focused';
    const color = active ? '#ff5470' : '#67f5d0';
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';

    if (r.faceBox) {
      const b = r.faceBox;
      // Mirror X coordinate so reticle overlays mirrored video
      const drawX = c.width - (b.x + b.width);
      const corner = Math.min(22, b.width * 0.18, b.height * 0.18);

      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      ctx.moveTo(drawX, b.y + corner);
      ctx.lineTo(drawX, b.y);
      ctx.lineTo(drawX + corner, b.y);
      ctx.moveTo(drawX + b.width - corner, b.y);
      ctx.lineTo(drawX + b.width, b.y);
      ctx.lineTo(drawX + b.width, b.y + corner);
      ctx.moveTo(drawX + b.width, b.y + b.height - corner);
      ctx.lineTo(drawX + b.width, b.y + b.height);
      ctx.lineTo(drawX + b.width - corner, b.y + b.height);
      ctx.moveTo(drawX + corner, b.y + b.height);
      ctx.lineTo(drawX, b.y + b.height);
      ctx.lineTo(drawX, b.y + b.height - corner);
      ctx.stroke();

      const cx = drawX + b.width / 2,
        cy = b.y + b.height * 0.4,
        len = Math.min(52, b.width * 0.35);
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      // Direction vector mirrored for mirrored video
      ctx.lineTo(
        cx - Math.sin((this.yaw * Math.PI) / 180) * len,
        cy + Math.sin((this.pitch * Math.PI) / 180) * len
      );
      ctx.stroke();

      ctx.globalAlpha = 0.9;
      ctx.fillText(`Y ${Math.round(this.yaw)}°  P ${Math.round(this.pitch)}°`, drawX, Math.max(14, b.y - 8));
    }

    // Top-right focus meter
    const meterW = Math.min(150, c.width * 0.32),
      meterX = c.width - meterW - 16,
      meterY = 18;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(meterX, meterY, meterW, 6);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(meterX, meterY, (meterW * r.focusScoreRealtime) / 100, 6);
    ctx.globalAlpha = 0.8;
    ctx.fillText(`FOCUS ${r.focusScoreRealtime}`, meterX, meterY + 22);

    // Study Mode badge top-left
    ctx.globalAlpha = 0.75;
    ctx.fillText(this.studyMode === 'book' ? '📖 BOOK MODE' : '💻 SCREEN MODE', 16, 24);

    if (active) {
      ctx.globalAlpha = 0.95;
      ctx.fillText((r.distractionReason ?? r.state).toUpperCase(), 16, c.height - 18);
    }
    ctx.restore();
    void vw;
    void vh;
  }
}
