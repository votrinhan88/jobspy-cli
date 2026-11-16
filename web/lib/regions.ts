const AUSTRALIA: Record<string, string> = {
  "australian capital territory": "ACT",
  "new south wales": "NSW",
  "northern territory": "NT",
  queensland: "QLD",
  "south australia": "SA",
  tasmania: "TAS",
  victoria: "VIC",
  "western australia": "WA",
};

const UNITED_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const CANADA: Record<string, string> = {
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "northwest territories": "NT", "nova scotia": "NS", nunavut: "NU",
  ontario: "ON", "prince edward island": "PE", quebec: "QC", saskatchewan: "SK", yukon: "YT",
};

const BY_COUNTRY: Record<string, Record<string, string>> = {
  australia: AUSTRALIA,
  "united states": UNITED_STATES,
  "united states of america": UNITED_STATES,
  usa: UNITED_STATES,
  us: UNITED_STATES,
  canada: CANADA,
};

// Display only: the stored region keeps its full name. The country decides the table, because
// "Victoria" is a state in Australia and a city in Canada.
export function abbreviateRegion(region: string, country: string): string {
  const table = BY_COUNTRY[country.trim().toLowerCase()];
  return table?.[region.trim().toLowerCase()] ?? region;
}
