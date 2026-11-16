import { describe, expect, it } from "vitest";
import { abbreviateRegion } from "@/lib/regions";

describe("abbreviateRegion", () => {
  it("shortens every Australian state and territory", () => {
    const pairs: [string, string][] = [
      ["Victoria", "VIC"],
      ["New South Wales", "NSW"],
      ["Queensland", "QLD"],
      ["South Australia", "SA"],
      ["Western Australia", "WA"],
      ["Tasmania", "TAS"],
      ["Northern Territory", "NT"],
      ["Australian Capital Territory", "ACT"],
    ];
    for (const [name, code] of pairs) expect(abbreviateRegion(name, "Australia")).toBe(code);
  });

  it("matches in any letter case", () => {
    expect(abbreviateRegion("victoria", "australia")).toBe("VIC");
  });

  it("shortens United States states and Canadian provinces", () => {
    expect(abbreviateRegion("California", "United States")).toBe("CA");
    expect(abbreviateRegion("District of Columbia", "USA")).toBe("DC");
    expect(abbreviateRegion("Ontario", "Canada")).toBe("ON");
  });

  it("keeps a name that has no code, and a region of another country", () => {
    expect(abbreviateRegion("Hồ Chí Minh", "Việt Nam")).toBe("Hồ Chí Minh");
    expect(abbreviateRegion("Victoria", "Canada")).toBe("Victoria");
    expect(abbreviateRegion("Victoria", "")).toBe("Victoria");
  });
});
