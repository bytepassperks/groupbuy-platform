interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

interface RateLimitOptions {
  max: number;
  window: number;
}

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<boolean> {
  const now = Date.now();
  const windowMs = options.window * 1000;
  
  const record = store[key];
  
  if (!record || now > record.resetTime) {
    store[key] = {
      count: 1,
      resetTime: now + windowMs,
    };
    return false;
  }
  
  record.count++;
  
  if (record.count > options.max) {
    return true;
  }
  
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    const record = store[key];
    if (record && now > record.resetTime) {
      delete store[key];
    }
  }
}, 60000);
