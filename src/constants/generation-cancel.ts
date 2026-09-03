import { API_ENDPOINTS } from './config'

/**
 * Contract constants for cancelling in-flight `GenerationJob` rows
 * (image / video / audio / 3D — anything dispatched through the execution
 * worker). Shared by the app's `/api/generations/cancel` route, the
 * `cancelGenerationsAPI` client wrapper, and the execution worker's own
 * `/cancel` handler.
 */

/** App-side route path — re-exported here so callers don't reach into `config.ts` directly. */
export const GENERATION_CANCEL_API_PATH = API_ENDPOINTS.GENERATIONS_CANCEL

/**
 * Max `jobId`s accepted per cancel request. Bounds "cancel all" batches from
 * the client — matches the request Zod schema's `.max()`.
 */
export const GENERATION_CANCEL_MAX_BATCH = 16
