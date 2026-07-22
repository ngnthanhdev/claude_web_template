import { Controller, Get, VERSION_NEUTRAL, Version } from "@nestjs/common";
import type { HealthResponse } from "@marketplace/shared/api";

@Controller("health")
export class HealthController {
  @Get()
  @Version(VERSION_NEUTRAL)
  check(): HealthResponse {
    return { status: "ok" };
  }
}
