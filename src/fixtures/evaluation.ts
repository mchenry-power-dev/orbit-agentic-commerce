import { createSampleBrief } from "./index";
export const evaluationFixtures = [
  {
    id: "normal-seasonal",
    description: "Autumn collection using supported catalog facts.",
    brief: createSampleBrief(),
    expected: "valid",
  },
  {
    id: "unsupported-prohibited",
    description: "Generated offer contains prohibited and unsupported claims.",
    brief: { ...createSampleBrief(), offer: "Guaranteed organic coffee" },
    expected: "blocked",
  },
  {
    id: "missing-reference",
    description: "Exclude a required product packaging reference.",
    brief: createSampleBrief(),
    excludedIds: ["image:aster-dawn"],
    expected: "blocked",
  },
  {
    id: "provider-failure",
    description:
      "One definitive image failure; independent steps finish, then resume.",
    brief: createSampleBrief(),
    failure: { assetId: "image-1", kind: "definitive" as const, count: 1 },
    expected: "recoverable",
  },
  {
    id: "narrow-revision",
    description:
      "Revise copy only; all other versions and approvals remain exact.",
    brief: createSampleBrief(),
    revision: { assetId: "copy", note: "Use shorter, concise copy." },
    expected: "targeted",
  },
] as const;
