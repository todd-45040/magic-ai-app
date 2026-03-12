# Magic AI Wizard — Phase 2 Internal AI Safety QA Checklist

This checklist is the manual validation pass for the Phase 2 hardening work.

## Scope
- Duplicate request protection
- Cooldown and burst protection
- Provider failure handling
- Input bound enforcement
- Live rehearsal session safety
- Video analysis safety
- Normalized response shape validation

## Success Response Shape
Expected normalized envelope:

```json
{
  "ok": true,
  "tool": "chat",
  "content": "...",
  "warnings": [],
  "usage": {
    "remaining": 19,
    "limit": 20,
    "membership": "trial"
  },
  "data": {
    "text": "..."
  }
}
```

## Error Response Shape
Expected normalized envelope:

```json
{
  "ok": false,
  "error_code": "TIMEOUT",
  "errorCode": "AI_TIMEOUT",
  "message": "AI is temporarily unavailable. Please try again in a moment.",
  "retryable": true,
  "warnings": []
}
```

## 1. Duplicate Requests
- Double-click Generate Patter once.
- Rapid-click Generate Patter 5 times.
- Submit the exact same prompt twice within the short duplicate window.
- Confirm duplicate requests are blocked or safely reused.
- Confirm the UI never shows two overlapping generation states.

## 2. Limit Protection
- Exhaust monthly quota on a Free account and confirm hard stop.
- Drive to burst threshold and confirm a rate-limit response.
- Trigger cooldown on the same tool twice in a short interval.
- Confirm response copy explains what happened.

## 3. Provider Failure Handling
- Simulate timeout.
- Simulate malformed JSON from `/api/ai/json`.
- Simulate empty provider output.
- Confirm the UI shows trusted friendly messages instead of raw errors.

## 4. Input Bounds
- Submit a text prompt beyond the max length.
- Upload an image above the image limit.
- Upload a video above the video size limit.
- Upload an unsupported video format.
- Confirm the request is rejected before provider execution.

## 5. Live Rehearsal Session Safety
- Start a live rehearsal session.
- Attempt multiple concurrent starts.
- Reconnect repeatedly until the reconnect cap is reached.
- Exceed the session duration cap and confirm end behavior.
- Confirm cleanup occurs on disconnect.

## 6. Video Analysis Safety
- Upload a valid short clip.
- Upload an invalid format.
- Upload a clip larger than the file size limit.
- Upload a clip over the duration cap.
- Exhaust monthly video analysis quota by plan.
- Confirm queue-state protection prevents duplicate analysis jobs.

## 7. Normalized Response Validation
Validate these endpoints all return the normalized envelope:
- `/api/ai/chat`
- `/api/ai/json`
- `/api/ai/image`
- `/api/ai/identify`
- `/api/ai/video-analysis`
- `/api/ai/live-rehearsal/start`

## QA Sign-Off Fields
- Build verified locally: ____
- Preview deployment verified: ____
- Free account checks complete: ____
- Amateur account checks complete: ____
- Professional account checks complete: ____
- Blocking defects found: ____
- Approved for next sprint: ____
