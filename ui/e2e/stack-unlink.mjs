// Strips the target field mappings from the workspace copy of mappings/order-id-copy, so the scenario's drag is real.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.argv[2], 'mappings', 'order-id-copy.mapping.json');
const model = JSON.parse(readFileSync(file, 'utf8'));
delete model.targetFieldMappings;
writeFileSync(file, JSON.stringify(model, null, 2) + '\n');
