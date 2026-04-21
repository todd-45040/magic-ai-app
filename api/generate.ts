import handler from './ai/chat.js';
import { markLegacyRoute } from './_lib/legacyRoute.js';

export default async function legacyProxy(req: any, res: any) {
  markLegacyRoute(res, '/api/ai/chat');
  return handler(req, res);
}
