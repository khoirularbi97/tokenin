export function deviceJson(row, online = false) {
  return {
    id: row.id,
    name: row.name,
    meterNumber: row.meter_number,
    meterBrand: row.meter_brand,
    powerVa: row.power_va,
    checkCode: row.check_code,
    lowKwhThreshold: row.low_kwh_threshold,
    lastKwh: row.last_kwh,
    lastKwhAt: row.last_kwh_at,
    lastSeen: row.last_seen,
    firmware: row.firmware,
    online,
    createdAt: row.created_at,
  };
}

export function jobJson(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    kind: row.kind,
    tokenMasked: row.token_masked,
    status: row.status,
    progress: row.progress,
    kwhBefore: row.kwh_before,
    kwhAfter: row.kwh_after,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export function photoJson(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    jobId: row.job_id,
    stage: row.stage,
    createdAt: row.created_at,
    image: row.image ? Buffer.from(row.image).toString('base64') : undefined,
  };
}
