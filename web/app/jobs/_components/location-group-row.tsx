export function LocationGroupRow({
  level,
  label,
  count,
  colSpan,
}: {
  level: "country" | "region";
  label: string;
  count: number;
  colSpan: number;
}) {
  const name = label || (level === "country" ? "Unknown location" : "No region");
  return (
    <tr className={`group-row group-row--${level}`}>
      <th scope="row" colSpan={colSpan}>
        {name}
        <span className="group-row-count">{count === 1 ? "1 job" : `${count} jobs`}</span>
      </th>
    </tr>
  );
}
