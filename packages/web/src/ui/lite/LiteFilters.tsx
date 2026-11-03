import React from 'react'
import { LITE_CONTROLS, LITE_FLOORS, liteWidened } from '@yieldcircle/core/model/lite'
import { useSettings } from '@yieldcircle/app/state/Settings'
import { FilterControls, Row, SlippagePicker } from '../SettingsPanel'
import { PaperSettings } from '../PaperPanel'

/**
 * Lite's settings in the profile sheet: the four filters Lite reads (core's `LITE_CONTROLS`), the
 * slippage every trade carries, and the paper account. Pro's other switches move nothing on a Lite
 * list, so they stay in Pro's panel. Same store: what is widened here is widened in Pro too.
 */
export function LiteFilters() {
  const { st, set } = useSettings()
  const n = liteWidened(st)
  return (
    <div className="setmenu">
      <div className="sm-h">
        <b>What Lite shows</b>
        <button className="sm-reset" disabled={n === 0} onClick={() => set(LITE_FLOORS)}>Reset</button>
      </div>
      <p className="sm-p">Big, rated savings that pay more than they cost. Widen it here.</p>
      <FilterControls controls={LITE_CONTROLS} />
      <div className="sm-h" style={{ marginTop: 14 }}><b>Trading</b></div>
      <Row label="Max slippage" note="how far a swap may fill from its quote">
        <SlippagePicker />
      </Row>
      <PaperSettings />
    </div>
  )
}
