/**
 * Runs in the browser before hydration (Next.js instrumentation-client
 * convention). Keep it synchronous and tiny.
 *
 * Zod v4 compiles fast object parsers with `new Function`, and probes for it
 * once with a guarded `new Function("")`. The production CSP has no
 * 'unsafe-eval' (src/lib/security/headers.ts), so that probe would be
 * reported as a CSP violation even though zod swallows the error. `jitless`
 * makes zod skip both the probe and the code generation. It must be set
 * before any client module builds a schema, which this file guarantees.
 */
import { z } from "zod";

z.config({ jitless: true });
