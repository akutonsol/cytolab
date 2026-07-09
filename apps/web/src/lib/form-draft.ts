import dayjs from 'dayjs';

// antd DatePicker fields hold dayjs objects, which don't survive JSON round-trips.
// encodeForm() tags them so a draft can be stored; decodeForm() revives them to
// dayjs before form.setFieldsValue() on restore.

const TAG = '__dayjs__';

/** Deep-copy `values`, replacing dayjs instances with a JSON-safe tag. */
export function encodeForm<T = any>(values: T): any {
  return JSON.parse(
    JSON.stringify(values, (_key, value) =>
      dayjs.isDayjs(value) ? { [TAG]: value.toISOString() } : value,
    ),
  );
}

/** Reverse of encodeForm(): revive tagged values back into dayjs instances. */
export function decodeForm<T = any>(encoded: T): any {
  const walk = (node: any): any => {
    if (node == null || typeof node !== 'object') return node;
    if (typeof node[TAG] === 'string') return dayjs(node[TAG]);
    if (Array.isArray(node)) return node.map(walk);
    const out: Record<string, any> = {};
    for (const k of Object.keys(node)) out[k] = walk(node[k]);
    return out;
  };
  return walk(encoded);
}
