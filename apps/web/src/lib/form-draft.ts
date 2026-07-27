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

// A bare ISO-8601 timestamp (what dayjs.toJSON()/toISOString() emits). Older drafts
// — saved before encodeForm() tagged dayjs values — stored dates as plain strings
// like this; reviving them to dayjs keeps antd DatePickers from crashing on restore
// (a DatePicker throws when handed a string instead of a dayjs).
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/;

/** Reverse of encodeForm(): revive tagged (and legacy bare-ISO) values to dayjs. */
export function decodeForm<T = any>(encoded: T): any {
  const walk = (node: any): any => {
    if (node == null || typeof node !== 'object') {
      return typeof node === 'string' && ISO_TIMESTAMP.test(node) ? dayjs(node) : node;
    }
    if (typeof node[TAG] === 'string') return dayjs(node[TAG]);
    if (Array.isArray(node)) return node.map(walk);
    const out: Record<string, any> = {};
    for (const k of Object.keys(node)) out[k] = walk(node[k]);
    return out;
  };
  return walk(encoded);
}
