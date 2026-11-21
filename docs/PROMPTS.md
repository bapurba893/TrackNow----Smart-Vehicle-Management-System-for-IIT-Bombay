# Prompts

The core app (React frontend, Express/Socket.IO backend, live maps, QR passes, red-list cron) was written by hand first. I then used **Claude Code** (Anthropic's coding agent, run in VS Code against this repo) to review it before sharing, finish the OCR feature, and build the evals. These are the prompts for that phase, in order.

---

### 1. Audit before going public

> Go through this repo as if you were reviewing it before it's shown to an interviewer. List every red flag: committed secrets, missing .gitignore, committed node_modules, anything left half-done, security holes, and bugs that would crash the server. Then fix them. Database credentials must not appear anywhere in the repo, including git history. Config should come from environment variables, with a `.env.example`.

What came out of it: removed the committed `.env` and `node_modules`, added `.gitignore` and `.env.example`, and rewrote history into a clean initial commit. It also fixed the login crash, the unique-password constraint, open security signup, missing role checks, change-anyone's-password, the `delivary` enum typo, red-listed plates being locked out forever, and unauthenticated sockets.

### 2. Lock down the real-time layer

> Sockets currently accept anyone. Require a JWT on connect for both namespaces. Drivers should only be able to broadcast as the vehicle in their token, not whatever plate the client sends. Visitor locations must go only to security guards, never to students. When a pass expires, the cron job should push a red-list alert to guards in real time.

### 3. Finish number-plate OCR

> Add number-plate OCR to the guard's "Add visitor" screen. Constraints: it has to run in the browser on a cheap phone, with no paid API, and photos should not leave the device. Use the phone's rear camera. Indian plates follow `SS DD L[L] NNNN`, so use that format to correct OCR mistakes like O/0, I/1, B/8 based on position, and validate the state code. Handle two-row plates and the "IND" text on HSRP plates. Show a confidence level and make the guard confirm. Never auto-submit.

### 4. Evals

> Write evals I can show, not just unit tests:
> (a) API and socket tests for every user story, including the bugs we just fixed, so they can't come back, running against an in-memory MongoDB;
> (b) a test table of messy OCR strings → expected plate;
> (c) an end-to-end OCR accuracy eval that generates synthetic Indian plates at easy/medium/hard difficulty and runs the same pipeline the app uses, reporting raw Tesseract vs. our pipeline, plus how often it's confidently wrong. Make it seeded and reproducible, and let me drop in real photos later.

### 5. Iterate on the eval results

> Accuracy is much lower than expected. Before changing the OCR, check whether the eval itself is wrong. Then save the failing images and look at them, and fix whatever the pipeline is actually getting wrong.

What came out of it: found a labelling bug in the eval generator first. Then debug images showed a dark car body flipping the plate's polarity, which led to the centre-of-frame threshold and plate-cropping step (medium-difficulty accuracy went from 42% with raw Tesseract to 86%).

### 6. Docs

> Rewrite the README for someone seeing the project for the first time: the problem, who has it, what each role can do, the visitor flow as a diagram, how OCR works, the security decisions, setup, deploy, and scope (in / out). Write up the evals with the real numbers, including what's weak.
