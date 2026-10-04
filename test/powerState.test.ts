import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectedToExternalPower } from '../packages/sdk/src/hardware/powerState';

describe('Power attachment across paused charging states', () => {
  it('keeps a plugged-in phone connected when charging pauses at full capacity', () => {
    assert.equal(connectedToExternalPower('USB', false), true);
    assert.equal(connectedToExternalPower('AC', null), true);
    assert.equal(connectedToExternalPower(null, true), true);
  });

  it('reports an observed unplugged phone without fabricating unknown status', () => {
    assert.equal(connectedToExternalPower('NONE', false), false);
    assert.equal(connectedToExternalPower('NONE', true), false);
    assert.equal(connectedToExternalPower(null, false), false);
    assert.equal(connectedToExternalPower(null, null), null);
  });
});
