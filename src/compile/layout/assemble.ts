import {Channel, COLUMN, ROW, X, Y} from '../../channel';
import {MAIN} from '../../data';
import {hasDiscreteDomain, scaleCompatible} from '../../scale';
import {extend, isArray, keys, StringSet} from '../../util';
import {isVgRangeStep, VgData, VgFormulaTransform, VgSignal, VgTransform} from '../../vega.schema';
import {FacetModel} from '../facet';
import {LayerModel} from '../layer';
import {Model, ModelWithField} from '../model';
import {ScaleComponent} from '../scale/component';
import {UnitModel} from '../unit';

// FIXME: rename this file to assemble.ts
// TODO: rewrite this such that we merge redundant signals
export function assembleLayoutLayerSignals(model: LayerModel): VgSignal[] {
  return [
    {name: model.getName('width'), update: layerSizeExpr(model, 'width')},
    {name: model.getName('height'), update: layerSizeExpr(model, 'height')}
  ];
}

export function layerSizeExpr(model: LayerModel, sizeType: 'width' | 'height'): string {
  const childrenSizeSignals = model.children.map(child => child.getName(sizeType)).join(', ');
  return `max(${childrenSizeSignals})`;
}

export function assembleLayoutUnitSignals(model: UnitModel): VgSignal[] {
  return [
    {name: model.getName('width'), update: unitSizeExpr(model, 'width')},
    {name: model.getName('height'), update: unitSizeExpr(model, 'height')}
  ];
}

export function unitSizeExpr(model: UnitModel, sizeType: 'width' | 'height'): string {
  const channel = sizeType==='width' ? 'x' : 'y';

  const scaleComponent = model.getScaleComponent(channel);
  if (scaleComponent) {
    const type = scaleComponent.get('type');
    const range = scaleComponent.get('range');

    if (hasDiscreteDomain(type) && isVgRangeStep(range)) {
      const scaleName = model.scaleName(channel);

      const cardinality = `domain('${scaleName}').length`;
      const padding = scaleComponent.get('padding');
      let paddingOuter = scaleComponent.get('paddingOuter');
      paddingOuter = paddingOuter !== undefined ? paddingOuter : padding;

      let paddingInner = scaleComponent.get('paddingInner');
      paddingInner = type === 'band' ?
        // only band has real paddingInner
        (paddingInner !== undefined ? paddingInner : padding) :
        // For point, as calculated in https://github.com/vega/vega-scale/blob/master/src/band.js#L128,
        // it's equivalent to have paddingInner = 1 since there is only n-1 steps between n points.
        1;

      return `bandspace(${cardinality}, ${paddingInner}, ${paddingOuter}) * ${range.step}`;
    }
  }
  return `${model.component.layoutSize.get(sizeType)}`;
}

