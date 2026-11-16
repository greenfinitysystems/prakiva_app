import React from 'react';

/** Four fixed mounting points measured from the panel, never from its content. */
export const PanelFasteners: React.FC<{ sidesOnly?: boolean }> = ({ sidesOnly = false }) => (
    <>
        <span aria-hidden="true" className={`sensor-panel-fastener ${sidesOnly ? 'sensor-panel-fastener-ml' : 'sensor-panel-fastener-tl'}`} />
        <span aria-hidden="true" className={`sensor-panel-fastener ${sidesOnly ? 'sensor-panel-fastener-mr' : 'sensor-panel-fastener-tr'}`} />
        {!sidesOnly && <>
            <span aria-hidden="true" className="sensor-panel-fastener sensor-panel-fastener-bl" />
            <span aria-hidden="true" className="sensor-panel-fastener sensor-panel-fastener-br" />
        </>}
    </>
);
