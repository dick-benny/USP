// Match the editable status fields shown in each Shopify modal.
export function launchShopifySummary(row, columns) {
  const category = row?.kategori;
  if (!['B2B-intro', 'B2C-intro'].includes(category)) return null;
  const fields = columns.filter(column => column.type === 'status' && !column.hiddenInTable
    && !column.mods?.readonly && !column.lockManualStatus
    && (!column.digprodCategories || column.digprodCategories.includes(category))
    && !(category === 'B2B-intro' && ['text_copy', 'utskick'].includes(column.field)));
  if (!fields.length) return null;
  const values = fields.map(column => row[column.field] || 'gray');
  return {
    field: category === 'B2B-intro' ? 'shopify_spec' : 'content',
    status: values.every(value => value === 'green') ? 'green'
      : values.some(value => value !== 'gray') ? 'yellow' : 'gray',
  };
}
