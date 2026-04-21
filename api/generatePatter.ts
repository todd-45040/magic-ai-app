import handler from './ai/generate-patter.js';
import { markLegacyRoute } from './_lib/legacyRoute.js';

export default async function legacyProxy(req: any, res: any) {
  markLegacyRoute(res, '/api/ai/generate-patter');
  return handler(req, res);
}
