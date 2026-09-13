import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.env.DOOM_SOURCE;
if (!root) throw new Error('Set DOOM_SOURCE to the original DOOM repository.');
const dir = mkdtempSync(join(tmpdir(), 'doom-fixed-'));
const pairs = [[-1,32768],[1,32768],[-65537,32768],[65536,65536],
  [2147483647,2147483647],[-2147483647,2147483647],[-2147483647,-2147483647],
  [1,0],[-1,0],[0,0],[65536,0],[0,65536],[65536,1],[-65536,1],
  [59392,-174221],[65535,65535],[123456789,87654321],[-123456789,87654321],
  [1,-65536],[16383,1],[16384,1]];
writeFileSync(join(dir,'driver.c'), `
#include <stdio.h>
#include <stdlib.h>
#include "m_fixed.h"
void I_Error(char *error, ...) { fprintf(stderr, "%s", error); exit(2); }
int main(void) {
 int pairs[][2] = {${pairs.map(([a,b])=>`{${a},${b}}`).join(',')}};
 for (unsigned i=0; i<sizeof(pairs)/sizeof(pairs[0]); i++) {
   int a=pairs[i][0], b=pairs[i][1];
   printf("%d %d %d %d\\n",a,b,FixedMul(a,b),FixedDiv(a,b));
 }
 return 0;
}
`);
const source = join(root,'linuxdoom-1.10/m_fixed.c');
execFileSync('cc',['-O0','-I',join(root,'linuxdoom-1.10'),join(dir,'driver.c'),source,'-o',join(dir,'oracle')]);
const vectors = execFileSync(join(dir,'oracle'),{encoding:'utf8'}).trim().split('\n').map(line=> {
  const [a,b,mul,div]=line.split(' ').map(Number); return {a,b,mul,div};
});
writeFileSync('tests/fixtures/fixed-reference.json',JSON.stringify({
  source:'linuxdoom-1.10/m_fixed.c',
  sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),
  compiler:execFileSync('cc',['--version'],{encoding:'utf8'}).split('\n')[0],
  command:'cc -O0 driver.c m_fixed.c', vectors
},null,2)+'\n');
console.log(`Generated ${vectors.length} vectors by executing original FixedMul/FixedDiv.`);
