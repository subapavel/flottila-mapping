export function moveRow(rows, from, delta) {
  const to = from + delta;
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = rows.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
