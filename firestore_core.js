export function convertFromFirestoreFields(fields) {
  const obj = {};
  for (const [key, valObj] of Object.entries(fields)) {
    if (!valObj) continue;
    if ("stringValue" in valObj) {
      obj[key] = valObj.stringValue;
    } else if ("doubleValue" in valObj) {
      obj[key] = Number(valObj.doubleValue);
    } else if ("integerValue" in valObj) {
      obj[key] = Number(valObj.integerValue);
    } else if ("booleanValue" in valObj) {
      obj[key] = valObj.booleanValue;
    } else if ("arrayValue" in valObj) {
      const values = valObj.arrayValue.values || [];
      obj[key] = values.map(v => v.stringValue || "");
    }
  }
  return obj;
}

export function convertToFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      fields[key] = { doubleValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => ({ stringValue: String(v) }))
        }
      };
    }
  }
  return { fields };
}
