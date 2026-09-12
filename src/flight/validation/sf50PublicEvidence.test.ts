import { describe, expect, it } from "vitest";
import {
  CEN21_RECORDER_COLUMNS, SF50_PUBLIC_STATIONS, evaluateSf50EvidenceReview,
  lookupNumericEvidenceTable, parseCen21RecorderCsv, parseEvidenceCsv,
  parseNumericEvidenceTable, sf50FsToBodyXFt,
} from "./sf50PublicEvidence";

const sample = (time: string, n1 = "24.4") =>
  [time, n1, "53.4", "10", "20.9", "2.53", "-0.64", "0.0", "Off",
    "Not Flaps 0%", "Not Flaps 100%", "Flaps 50%", "7.7", "11.17", "-22"].join(",");
const csv = (...samples: string[]) => [
  "NTSB CEN21LA384", "DATA", CEN21_RECORDER_COLUMNS.join(","),
  "(EDT),(%),(%),(kt),(kt),(Deg),(Deg),(kt),(),(),(),(),(deg),(deg/s),(Deg)",
  ",NUMBER,NUMBER,NUMBER,NUMBER,NUMBER,NUMBER,NUMBER,discrete,discrete,discrete,discrete,NUMBER,NUMBER,NUMBER",
  ...samples,
].join("\n");

describe("SF50 public evidence ingestion", () => {
  it("parses quoted commas, escaped quotes and CRLF", () => {
    expect(parseEvidenceCsv('a,b\r\n"x,y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x,y", 'say "hi"']]);
    expect(() => parseEvidenceCsv('"unfinished')).toThrow();
  });

  it("preserves missing cells rather than converting them to zero", () => {
    expect(parseEvidenceCsv("a,b\n1,\n")).toEqual([["a", "b"], ["1", ""]]);
    expect(() => parseNumericEvidenceTable("weight,value\n5000,\n")).toThrow();
  });

  it("normalizes the documented channels and explicitly collapses identical timestamp duplicates", () => {
    const result = parseCen21RecorderCsv(csv(sample("18:57:05.32"), sample("18:57:05.32"), sample("18:57:05.72")));
    expect(result.sourceRows).toBe(3);
    expect(result.duplicateRows).toBe(1);
    expect(result.uniqueTimes).toBe(2);
    expect(result.gaps[0]?.dtSec).toBe(0.4);
    expect(result.samples[0]).toMatchObject({ n1Percent: 24.4, parkingBrake: false, flapCommandNorm: 0.5 });
    expect(result.samples[1]?.elapsedSec).toBe(0.4);
    expect(result.aircraftValidated).toBe(false);
  });

  it("rejects conflicting duplicate times and backwards clocks", () => {
    expect(() => parseCen21RecorderCsv(csv(sample("18:57:05.32"), sample("18:57:05.32", "25")))).toThrow(/Conflicting/);
    expect(() => parseCen21RecorderCsv(csv(sample("18:57:05.72"), sample("18:57:05.32")))).toThrow(/backwards/);
  });

  it("rejects changed units, empty numeric channels and ambiguous flap commands", () => {
    expect(() => parseCen21RecorderCsv(csv(sample("18:57:05.32")).replace("(EDT)", "(UTC)"))).toThrow(/units/);
    expect(() => parseCen21RecorderCsv(csv(sample("18:57:05.32", "")))).toThrow();
    expect(() => parseCen21RecorderCsv(csv(sample("18:57:05.32").replace("Not Flaps 0%", "Flaps 0%")))).toThrow(/Ambiguous/);
  });

  it("interpolates source tables without extrapolating or hiding duplicate coordinates", () => {
    const table = parseNumericEvidenceTable("weight,temperature,value\n5000,10,100\n5000,20,120\n6000,10,200\n6000,20,220\n");
    expect(lookupNumericEvidenceTable(table, { weight: 5500, temperature: 15 })).toBe(160);
    expect(() => lookupNumericEvidenceTable(table, { weight: 7000, temperature: 15 })).toThrow(RangeError);
    expect(() => parseNumericEvidenceTable("weight,value\n5000,100\n5000,101\n")).toThrow(/Duplicate/);
  });

  it("keeps incomplete recordings ineligible regardless of their numeric fit", () => {
    const result = evaluateSf50EvidenceReview({ sourceKind: "recording", provenanceVerified: true });
    expect(result.eligibleForComparison).toBe(false);
    expect(result.blockers).toContain("normalOperationReviewed");
    expect(result.blockers).toContain("timebaseReviewed");
    expect(result.blockers).toContain("conditionsMatched");
  });

  it("does not call eligibility an aircraft validation pass or reuse calibration as independent evidence", () => {
    const review = { sourceKind: "afm-table" as const, provenanceVerified: true, applicableVariant: true,
      unitsVerified: true, conditionsMatched: true };
    expect(evaluateSf50EvidenceReview(review, "calibration").eligibleForComparison).toBe(true);
    expect(evaluateSf50EvidenceReview(review).eligibleForComparison).toBe(false);
    expect(evaluateSf50EvidenceReview({ ...review, independentOfCalibration: true }).aircraftValidated).toBe(false);
  });

  it("distinguishes wing and tail MAC and requires an explicit forward-positive body anchor", () => {
    expect(SF50_PUBLIC_STATIONS.wingMacIn).toBe(62.2);
    expect(SF50_PUBLIC_STATIONS.tailMacIn).toBe(44.1);
    expect(sf50FsToBodyXFt(112, { stationFsIn: 100, bodyXFt: 0 })).toBe(-1);
    expect(sf50FsToBodyXFt(88, { stationFsIn: 100, bodyXFt: 0 })).toBe(1);
    expect(() => sf50FsToBodyXFt(100, { stationFsIn: NaN, bodyXFt: 0 })).toThrow();
  });
});
