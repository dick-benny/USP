import { supabase } from './supabase.js';
import {
  STATUS_ORDER,
  OWNER_TABLES,
  PDF_BUCKET,
} from './app_constants.js?v=37';

export function createDataController({ APP_CONFIG, SAMPLE_ROWS = {} }) {
  function getFieldTypeConfig(typeName) {
    return APP_CONFIG.fieldTypes?.[typeName] || null;
  }

  function isOwnerEnabledTable(tableName) {
    return OWNER_TABLES.includes(tableName);
  }

  function getDefaultValue(tableName, column) {
    const sampleRow = SAMPLE_ROWS?.[tableName]?.[0] || {};
    if (sampleRow[column.field] !== undefined) return sampleRow[column.field];
    if (column.default !== undefined) return column.default;
    const fieldType = getFieldTypeConfig(column.type);
    if (fieldType && fieldType.defaultValue !== undefined) return fieldType.defaultValue;
    return '';
  }

  function normalizeStatusValue(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    return STATUS_ORDER.includes(raw) ? raw : 'gray';
  }

  function normalizePdfPath(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '---') return '';

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const url = new URL(raw);
        const publicMarker = `/storage/v1/object/public/${PDF_BUCKET}/`;
        const signMarker = `/storage/v1/object/sign/${PDF_BUCKET}/`;
        if (url.pathname.includes(publicMarker)) {
          return decodeURIComponent(url.pathname.split(publicMarker)[1] || '');
        }
        if (url.pathname.includes(signMarker)) {
          return decodeURIComponent(url.pathname.split(signMarker)[1] || '');
        }
        return raw;
      } catch (err) {
        return raw;
      }
    }

    if (raw.startsWith(`${PDF_BUCKET}/`)) {
      return raw.slice(PDF_BUCKET.length + 1);
    }

    return raw;
  }

  function stripCommonStoragePrefix(fileName) {
    const raw = String(fileName || '').trim();
    if (!raw) return '';

    let cleaned = raw;
    cleaned = cleaned.replace(/^[0-9]{10,}[-_]/, '');
    cleaned = cleaned.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, '');
    cleaned = cleaned.replace(/^[0-9a-f]{20,}[-_]/i, '');

    return cleaned || raw;
  }

  function getPdfFileName(value) {
    const path = normalizePdfPath(value);
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  }

  function getPdfDisplayName(value) {
    const fileName = getPdfFileName(value);
    return stripCommonStoragePrefix(fileName);
  }

  function normalizeRow(tableName, tableConfig, row = {}) {
    const normalized = { ...row };

    tableConfig.columns.forEach((column) => {
      if (normalized[column.field] === undefined || normalized[column.field] === null) {
        normalized[column.field] = getDefaultValue(tableName, column);
      }

      if (column.type === 'status') {
        normalized[column.field] = normalizeStatusValue(normalized[column.field]);
      }

      if (column.type === 'pdf') {
        normalized[column.field] = normalizePdfPath(normalized[column.field]);
      }
    });

    if (isOwnerEnabledTable(tableName) && normalized.owner_initials === undefined) {
      normalized.owner_initials = '';
    }

    if (normalized.is_done === undefined) {
      normalized.is_done = false;
    }

    return normalized;
  }

  async function loadTableRows(state, tableName, tableConfig) {
    try {
      const { data, error } = await supabase.from(tableConfig.dbTable).select('*');

      if (error) {
        console.warn(`Supabase error for ${tableConfig.dbTable}:`, error.message);
        state.rowsByTable[tableName] = (SAMPLE_ROWS[tableName] || []).map((row) =>
          normalizeRow(tableName, tableConfig, row)
        );
        return;
      }

      const rows = Array.isArray(data) && data.length
        ? data.map((row) => normalizeRow(tableName, tableConfig, row))
        : (SAMPLE_ROWS[tableName] || []).map((row) => normalizeRow(tableName, tableConfig, row));

      state.rowsByTable[tableName] = rows;
    } catch (err) {
      console.error(`Unexpected fetch error for ${tableConfig.dbTable}:`, err);
      state.rowsByTable[tableName] = (SAMPLE_ROWS[tableName] || []).map((row) =>
        normalizeRow(tableName, tableConfig, row)
      );
    }
  }

  return {
    getDefaultValue,
    normalizeStatusValue,
    normalizePdfPath,
    stripCommonStoragePrefix,
    getPdfFileName,
    getPdfDisplayName,
    normalizeRow,
    loadTableRows,
  };
}
