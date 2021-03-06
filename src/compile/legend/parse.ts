import {Channel, COLOR, NonspatialScaleChannel, OPACITY, SHAPE, SIZE} from '../../channel';
import {Legend, LEGEND_PROPERTIES} from '../../legend';
import {Dict, keys} from '../../util';
import {VgLegend} from '../../vega.schema';
import {numberFormat} from '../common';
import {Model} from '../model';
import {UnitModel} from '../unit';
import {LegendComponent, LegendComponentIndex} from './component';
import * as encode from './encode';
import * as rules from './rules';


export function parseLegendComponent(model: UnitModel): LegendComponentIndex {
  return [COLOR, SIZE, SHAPE, OPACITY].reduce(function(legendComponent, channel) {
    if (model.legend(channel)) {
      legendComponent[channel] = parseLegend(model, channel);
    }
    return legendComponent;
  }, {});
}

function getLegendDefWithScale(model: UnitModel, channel: Channel): LegendComponent {
  // For binned field with continuous scale, use a special scale so we can overrride the mark props and labels
  switch (channel) {
    case COLOR:
      const scale = model.scaleName(COLOR);
      return model.markDef.filled ? {fill: scale} : {stroke: scale};
    case SIZE:
      return {size: model.scaleName(SIZE)};
    case SHAPE:
      return {shape: model.scaleName(SHAPE)};
    case OPACITY:
      return {opacity: model.scaleName(OPACITY)};
  }
  return null;
}

export function parseLegend(model: UnitModel, channel: NonspatialScaleChannel): LegendComponent {
  const fieldDef = model.fieldDef(channel);
  const legend = model.legend(channel);

  const def: VgLegend = getLegendDefWithScale(model, channel);

  LEGEND_PROPERTIES.forEach(function(property) {
    const value = getSpecifiedOrDefaultValue(property, legend, channel, model);
    if (value !== undefined) {
      def[property] = value;
    }
  });

  // 2) Add mark property definition groups
  const legendEncoding = legend.encoding || {};
  ['labels', 'legend', 'title', 'symbols'].forEach(function(part) {
    const value = encode[part] ?
      encode[part](fieldDef, legendEncoding[part], model, channel) : // apply rule
      legendEncoding[part]; // no rule -- just default values
    if (value !== undefined && keys(value).length > 0) {
      def.encode = def.encode || {};
      def.encode[part] = {update: value};
    }
  });

  return def;
}

function getSpecifiedOrDefaultValue(property: keyof (Legend | VgLegend), specifiedLegend: Legend, channel: NonspatialScaleChannel, model: UnitModel) {
  const fieldDef = model.fieldDef(channel);

  switch (property) {
    case 'format':
      return numberFormat(fieldDef, specifiedLegend.format, model.config);
    case 'title':
      return rules.title(specifiedLegend, fieldDef, model.config);
    case 'values':
      return rules.values(specifiedLegend);
    case 'type':
      return rules.type(specifiedLegend, fieldDef.type, channel, model.getScaleComponent(channel).get('type'));
  }

  // Otherwise, return specified property.
  return specifiedLegend[property];
}


/**
 * Move legend from child up.
 */
export function moveSharedLegendUp(legendComponents: LegendComponentIndex, child: Model, channel: Channel) {
  // just use the first legend definition for each channel
  if (!legendComponents[channel]) {
    legendComponents[channel] = child.component.legends[channel];
  }
  delete child.component.legends[channel];
}
