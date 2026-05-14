export const PLACEHOLDER_VIEWS = [
  ['MARKNAD', { id: 'marknad', title: 'MARKNAD', placeholder: true }],
  ['SÄLJ', { id: 'salj', title: 'SÄLJ', placeholder: true }],
  ['INKÖP', { id: 'inkop', title: 'INKÖP', placeholder: true }],];

export function insertPlaceholderViews(tableEntries, insertAfterTableName = 'PROJEKT') {
  if (!Array.isArray(tableEntries)) return tableEntries;

  const existingNames = new Set(tableEntries.map(([tableName]) => tableName));
  const entriesToInsert = PLACEHOLDER_VIEWS.filter(([tableName]) => !existingNames.has(tableName));

  if (!entriesToInsert.length) return tableEntries;

  const insertIndex = tableEntries.findIndex(([tableName]) => tableName === insertAfterTableName);
  if (insertIndex >= 0) {
    tableEntries.splice(insertIndex + 1, 0, ...entriesToInsert);
  } else {
    tableEntries.push(...entriesToInsert);
  }

  return tableEntries;
}
