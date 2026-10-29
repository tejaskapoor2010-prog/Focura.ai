/**
 * Razorpay Payment Gateway Client Integration
 * Handles script injection, order generation, checkout triggering, and verification
 */

export interface RazorpayConfig {
  isConfigured: boolean;
  isLive: boolean;
  keyId: string | null;
  businessName: string;
  description: string;
  themeColor: string;
  currency: string;
}

export interface RazorpayOrderResponse {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  isLive?: boolean;
  isSandbox?: boolean;
  message?: string;
  error?: string;
}

export interface RazorpayVerifyResponse {
  success: boolean;
  verified: boolean;
  message: string;
  plan: string;
  paymentId: string;
  orderId: string;
  amount: number;
  activatedAt: string;
  isSandbox?: boolean;
  error?: string;
}

/**
 * Loads Razorpay Standard Checkout SDK into document
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      if ((window as any).Razorpay) return resolve(true);
      const timer = setTimeout(() => {
        resolve(Boolean((window as any).Razorpay));
      }, 2500);

      existingScript.addEventListener('load', () => {
        clearTimeout(timer);
        resolve(true);
      }, { once: true });
      existingScript.addEventListener('error', () => {
        clearTimeout(timer);
        resolve(false);
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = setTimeout(() => {
      resolve(Boolean((window as any).Razorpay));
    }, 3000);

    script.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    script.onerror = () => {
      clearTimeout(timer);
      console.warn('Could not load external Razorpay checkout.js script');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * Fetches Razorpay public status and configuration
 */
export async function getRazorpayConfig(): Promise<RazorpayConfig> {
  try {
    const res = await fetch('/api/razorpay/config');
    if (!res.ok) throw new Error('Failed to load razorpay config');
    return await res.json();
  } catch {
    return {
      isConfigured: false,
      isLive: false,
      keyId: null,
      businessName: 'Focura Smart Study',
      description: 'AI Focus Platform & Study Mastery',
      themeColor: '#f59e0b',
      currency: 'INR',
    };
  }
}

/**
 * Creates Razorpay order on backend server
 */
export async function createRazorpayOrder(params: {
  plan: string;
  amount: number;
  currency?: string;
  userId: string;
  userEmail: string;
  userName: string;
}): Promise<RazorpayOrderResponse> {
  const res = await fetch('/api/razorpay/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    let msg = err.error || 'Failed to initialize payment order';
    if (err.details && typeof err.details === 'string') {
      try {
        const parsed = JSON.parse(err.details);
        if (parsed.error?.description) {
          msg = `Razorpay: ${parsed.error.description}`;
        }
      } catch {
        // use original msg
      }
    }
    throw new Error(msg);
  }

  return await res.json();
}

/**
 * Verifies Razorpay payment signature and activates plan
 */
export async function verifyRazorpayPayment(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
  plan: string;
  amount: number;
  userId: string;
  userEmail: string;
  userName: string;
}): Promise<RazorpayVerifyResponse> {
  const res = await fetch('/api/razorpay/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Payment verification failed');
  }

  return await res.json();
}

/**
 * Checks with Razorpay API if an order has been paid and captured
 */
export async function checkRazorpayOrderStatus(params: {
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: string;
}): Promise<{ success: boolean; verified?: boolean; paymentId?: string; error?: string }> {
  try {
    const query = new URLSearchParams({
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      plan: params.plan,
    });
    const res = await fetch(`/api/razorpay/check-order/${encodeURIComponent(params.orderId)}?${query.toString()}`);
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

/**
 * Instantly activates subscription on backend
 */
export async function manualActivateSubscription(params: {
  userId: string;
  userEmail: string;
  userName: string;
  plan: string;
  amount: number;
  method?: string;
  utr?: string;
}): Promise<{ success: boolean; message?: string; paymentId?: string }> {
  const res = await fetch('/api/subscription/manual-activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to activate plan');
  }
  return await res.json();
}
