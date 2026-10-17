import { z } from "zod";

// NOTE: configure before app imports construct schemas and probe JavaScript eval.
z.config({ jitless: true });
