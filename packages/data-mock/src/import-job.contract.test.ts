import { importJobContract } from "@churchy/contracts/testing";
import { createMockImportJob } from "./import-job";

importJobContract("mock", () => createMockImportJob({ stageDelayMs: 0 }));
