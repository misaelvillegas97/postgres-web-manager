// ExplainController is deprecated. The /queries/explain endpoint is now handled
// by QueryController (apps/api/src/modules/query/query.controller.ts).
// This controller is kept empty to preserve the module structure.
import { Controller } from '@nestjs/common';

@Controller('explain')
export class ExplainController {}
