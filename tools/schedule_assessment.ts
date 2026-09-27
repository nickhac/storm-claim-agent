import { load_settings, type ScheduleAssessmentResult } from "./types.js";

/** Book an assessor from the fixture window table. */
export function schedule_assessment(input: {
  claim_ref: string;
  preferred_window: string;
}): ScheduleAssessmentResult {
  const settings = load_settings();
  const booking_date = settings.assessment.windows[input.preferred_window];
  if (!booking_date) {
    console.error(`schedule_assessment: unknown window ${input.preferred_window} for ${input.claim_ref}`);
    throw new Error(`unknown preferred_window ${input.preferred_window}`);
  }
  return {
    booking_date,
    assessor_name: settings.assessment.assessor_name,
    source: "snapshot",
  };
}
