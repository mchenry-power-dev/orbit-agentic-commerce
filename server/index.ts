import { join } from "node:path";
import { FileAllowance } from "./allowance";
import { OpenAiProviders } from "./providers";
import { ProtectedService } from "./service";
import { publicFailure, ServiceError } from "./errors";

let allowance: FileAllowance | undefined;
try {
  const approved = process.env.ORBIT_SERVICE_GENERATION_APPROVED === "yes";
  const integer = (name: string): number => {
    const value = Number(process.env[name]);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ServiceError(
        "runtime-config",
        `${name} must be explicitly configured as a positive integer.`,
        503,
      );
    return value;
  };
  let generation;
  if (approved) {
    const approvalId = process.env.ORBIT_SERVICE_APPROVAL_ID ?? "";
    allowance = await FileAllowance.open(
      process.env.ORBIT_SERVICE_STATE_DIR ??
        join(process.cwd(), ".orbit-runtime"),
      integer("ORBIT_SERVICE_COST_CEILING_CENTS"),
      approvalId,
    );
    const providers = new OpenAiProviders({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      planningModel: process.env.ORBIT_PLANNING_MODEL ?? "",
      imageModel: process.env.ORBIT_IMAGE_MODEL ?? "",
      maxOutputTokens: 6000,
      planTimeoutMs: 30_000,
      imageTimeoutMs: 60_000,
    });
    generation = {
      approved: true as const,
      approvalId,
      allowance,
      planReservationCents: integer("ORBIT_SERVICE_PLAN_RESERVATION_CENTS"),
      imageReservationCents: integer("ORBIT_SERVICE_IMAGE_RESERVATION_CENTS"),
      semanticProvider: providers,
      imageProvider: providers,
    };
  }
  const service = new ProtectedService({
    accessSecret: process.env.ORBIT_SERVICE_ACCESS_SECRET ?? "",
    generation,
  });
  const port = await service.listen(
    Number(process.env.ORBIT_SERVICE_PORT ?? 4318),
  );
  console.log(
    `Orbit protected local service listening on 127.0.0.1:${port}. Generation ${approved ? "explicitly configured" : "disabled"}.`,
  );
  const stop = async () => {
    await service.close();
    await allowance?.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
} catch (error) {
  await allowance?.close().catch(() => {});
  const failure = publicFailure(error);
  console.error(`${failure.code}: ${failure.message}`);
  process.exitCode = 1;
}
