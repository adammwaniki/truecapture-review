// CAPTCHA verifier (the `captcha` seam). The public /sign has no secret key, so
// a human-check (Turnstile/hCaptcha/reCAPTCHA-style) plus the per-IP rate limit
// and Origin allowlist are the abuse controls (C3). `fetchImpl` is injected so
// the client is testable without network.
export function createCaptchaVerifier({ verifyUrl, secret, fetchImpl = fetch }) {
  return {
    async verify(token) {
      if (!token) return false;
      const res = await fetchImpl(verifyUrl, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.success === true;
    },
  };
}
