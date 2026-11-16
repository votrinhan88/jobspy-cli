"use client";

import { useEffect, useState } from "react";

type JobspyVersion = { installed: string | null; latest: string | null; outdated: boolean };

export function JobspyUpdateNotice() {
  const [info, setInfo] = useState<JobspyVersion | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/jobspy-version")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: JobspyVersion | null) => {
        if (active && data?.outdated && data.installed && data.latest) setInfo(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!info) return null;

  return (
    <div role="status" className="alert alert-warning">
      <p>python-jobspy {info.installed} is out of date. Version {info.latest} is available.</p>
      <p>
        To update, run <code>uv lock --upgrade-package python-jobspy</code> and then{" "}
        <code>uv sync</code> in the project folder.
      </p>
    </div>
  );
}
