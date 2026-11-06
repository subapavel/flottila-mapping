// Strips the target field mappings from the workspace copy of mappings/order-id-copy, so the scenario's drag is real.
// The same unlinked model is written as the scenarios' own mappings, so that no two scenarios edit one file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const mappings = join(process.argv[2], 'mappings');
const model = JSON.parse(readFileSync(join(mappings, 'order-id-copy.mapping.json'), 'utf8'));
delete model.targetFieldMappings;
for (const name of ['order-id-copy', 'e2e-edit', 'e2e-attribute']) {
  writeFileSync(join(mappings, `${name}.mapping.json`), JSON.stringify(model, null, 2) + '\n');
}
