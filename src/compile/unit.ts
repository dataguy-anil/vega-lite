import {Axis} from '../axis';
import {Channel, isScaleChannel, NONSPATIAL_SCALE_CHANNELS, SCALE_CHANNELS, ScaleChannel, SingleDefChannel, UNIT_CHANNELS, X, X2, Y, Y2} from '../channel';
import {CellConfig, Config} from '../config';
import * as vlEncoding from '../encoding'; // TODO: remove
import {Encoding, normalizeEncoding} from '../encoding';
import {ChannelDef, field, FieldDef, FieldRefOption, getFieldDef, isConditionalDef, isFieldDef} from '../fielddef';
import {Legend} from '../legend';
import {FILL_STROKE_CONFIG, isMarkDef, Mark, MarkDef, TEXT as TEXT_MARK} from '../mark';
import {defaultScaleConfig, Domain, hasDiscreteDomain, Scale} from '../scale';
import {SelectionDef} from '../selection';
import {SortField, SortOrder} from '../sort';
import {LayoutSize, UnitSpec} from '../spec';
import {stack, StackProperties} from '../stack';
import {Dict, duplicate, extend, vals} from '../util';
import {VgData, VgEncodeEntry, VgLayout, VgScale, VgSignal} from '../vega.schema';
import {AxisIndex} from './axis/component';
import {parseUnitAxis} from './axis/parse';
import {applyConfig} from './common';
import {assembleData} from './data/assemble';
import {parseData} from './data/parse';
import {FacetModel} from './facet';
import {LayerModel} from './layer';
import {assembleLayoutUnitSignals} from './layout/assemble';
import {LegendIndex} from './legend/component';
import {parseLegendComponent} from './legend/parse';
import {initEncoding} from './mark/init';
import {parseMarkGroup} from './mark/mark';
import {Model, ModelWithField} from './model';
import {RepeaterValue, replaceRepeaterInEncoding} from './repeat';
import {ScaleIndex} from './scale/component';
import {assembleTopLevelSignals, assembleUnitSelectionData, assembleUnitSelectionMarks, assembleUnitSelectionSignals, parseUnitSelection} from './selection/selection';
import {Split} from './split';


/**
 * Internal model of Vega-Lite specification for the compiler.
 */
export class UnitModel extends ModelWithField {
  public readonly markDef: MarkDef;
  public readonly encoding: Encoding<string>;

  public readonly specifiedScales: ScaleIndex = {};

  public readonly stack: StackProperties;

  protected specifiedAxes: AxisIndex = {};

  protected specifiedLegends: LegendIndex = {};

  public readonly selection: Dict<SelectionDef> = {};
  public children: Model[] = [];

  constructor(spec: UnitSpec, parent: Model, parentGivenName: string,
    parentGivenSize: LayoutSize = {}, repeater: RepeaterValue, config: Config) {

    super(spec, parent, parentGivenName, config, {});
    this.initSize({
      ...parentGivenSize,
      ...(spec.width ? {width: spec.width} : {}),
      ...(spec.height ? {height: spec.height} : {})
    });

    // FIXME(#2041): copy config.facet.cell to config.cell -- this seems incorrect and should be rewritten
    this.initFacetCellConfig();

    this.markDef = isMarkDef(spec.mark) ? {...spec.mark} : {type: spec.mark};
    const mark = this.markDef.type;
    const encoding = this.encoding = normalizeEncoding(replaceRepeaterInEncoding(spec.encoding || {}, repeater), mark);

    // calculate stack properties
    this.stack = stack(mark, encoding, this.config.stack);
    this.specifiedScales = this.initScales(mark, encoding);

    // FIXME: this one seems out of place!
    this.encoding = initEncoding(mark, encoding, this.stack, this.config);

    this.specifiedAxes = this.initAxes(encoding);
    this.specifiedLegends = this.initLegend(encoding);

    // Selections will be initialized upon parse.
    this.selection = spec.selection;
  }

  /**
   * Return specified Vega-lite scale domain for a particular channel
   * @param channel
   */
  public scaleDomain(channel: ScaleChannel): Domain {
    const scale = this.specifiedScales[channel];
    return scale ? scale.domain : undefined;
  }

  public hasDiscreteDomain(channel: Channel) {
    if (isScaleChannel(channel)) {
      const scaleCmpt = this.getScaleComponent(channel);
      return scaleCmpt && hasDiscreteDomain(scaleCmpt.get('type'));
    }
    return false;
  }


  public sort(channel: Channel): SortField | SortOrder {
    return (this.getMapping()[channel] || {}).sort;
  }

  public axis(channel: Channel): Axis {
    return this.specifiedAxes[channel];
  }

  public legend(channel: Channel): Legend {
    return this.specifiedLegends[channel];
  }
  private initFacetCellConfig() {
    const config = this.config;
    let ancestor = this.parent;
    let hasFacetAncestor = false;
    while (ancestor !== null) {
      if (ancestor instanceof FacetModel) {
        hasFacetAncestor = true;
        break;
      }
      ancestor = ancestor.parent;
    }

    if (hasFacetAncestor) {
      config.cell = extend({}, config.cell, config.facet.cell);
    }
  }

  private initScales(mark: Mark, encoding: Encoding<string>): ScaleIndex {
    return SCALE_CHANNELS.reduce((scales, channel) => {
      let fieldDef: FieldDef<string>;
      let specifiedScale: Scale;

      const channelDef = encoding[channel];

      if (isFieldDef(channelDef)) {
        fieldDef = channelDef;
        specifiedScale = channelDef.scale;
      } else if (isConditionalDef(channelDef) && isFieldDef(channelDef.condition)) {
        fieldDef = channelDef.condition;
        specifiedScale = channelDef.condition.scale;
      } else if (channel === 'x') {
        fieldDef = getFieldDef(encoding.x2);
      } else if (channel === 'y') {
        fieldDef = getFieldDef(encoding.y2);
      }

      if (fieldDef) {
        scales[channel] = specifiedScale || {};
      }
      return scales;
    }, {} as ScaleIndex);
  }

  private initAxes(encoding: Encoding<string>): AxisIndex {
    return [X, Y].reduce(function(_axis, channel) {
      // Position Axis

      // TODO: handle ConditionFieldDef
      const channelDef = encoding[channel];
      if (isFieldDef(channelDef) ||
          (channel === X && isFieldDef(encoding.x2)) ||
          (channel === Y && isFieldDef(encoding.y2))) {

        const axisSpec = isFieldDef(channelDef) ? channelDef.axis : null;

        // We no longer support false in the schema, but we keep false here for backward compatability.
        if (axisSpec !== null && axisSpec !== false) {
          _axis[channel] = {
            ...axisSpec
          };
        }
      }
      return _axis;
    }, {});
  }

  private initLegend(encoding: Encoding<string>): LegendIndex {
    return NONSPATIAL_SCALE_CHANNELS.reduce(function(_legend, channel) {
      const channelDef = encoding[channel];
      if (channelDef) {
        const legend = isFieldDef(channelDef) ? channelDef.legend :
          (channelDef.condition && isFieldDef(channelDef.condition)) ? channelDef.condition.legend : null;

        if (legend !== null && legend !== false) {
          _legend[channel] = {...legend};
        }
      }

      return _legend;
    }, {});
  }

  public parseData() {
    this.component.data = parseData(this);
  }

  public parseSelection() {
    this.component.selection = parseUnitSelection(this, this.selection);
  }

  public parseMarkGroup() {
    this.component.mark = parseMarkGroup(this);
  }

  public parseAxisAndHeader() {
    this.component.axes = parseUnitAxis(this);
  }

  public parseLegend() {
    this.component.legends = parseLegendComponent(this);
  }

  public assembleData(): VgData[] {
     if (!this.parent) {
      // only assemble data in the root
      return assembleData(this.component.data);
    }
    return [];
  }

  public assembleSelectionTopLevelSignals(signals: any[]): VgSignal[] {
    return assembleTopLevelSignals(this, signals);
  }

  public assembleSelectionSignals(): VgSignal[] {
    return assembleUnitSelectionSignals(this, []);
  }

  public assembleSelectionData(data: VgData[]): VgData[] {
    return assembleUnitSelectionData(this, data);
  }

  public assembleLayout(): VgLayout {
    return null;
  }

  public assembleLayoutSignals(): VgSignal[] {
    return assembleLayoutUnitSignals(this);
  }

  public assembleMarks() {
    let marks = this.component.mark || [];

    // If this unit is part of a layer, selections should augment
    // all in concert rather than each unit individually. This
    // ensures correct interleaving of clipping and brushed marks.
    if (!this.parent || !(this.parent instanceof LayerModel)) {
      marks = assembleUnitSelectionMarks(this, marks);
    }

    return marks.map(this.correctDataNames);
  }

  public assembleParentGroupProperties(): VgEncodeEntry {
    return {
      width: this.getSizeSignalRef('width'),
      height: this.getSizeSignalRef('height'),
      ...applyConfig({}, this.config.cell, FILL_STROKE_CONFIG.concat(['clip']))
    };
  }

  protected getMapping() {
    return this.encoding;
  }

  public toSpec(excludeConfig?: any, excludeData?: any) {
    const encoding = duplicate(this.encoding);
    let spec: any;

    spec = {
      mark: this.markDef,
      encoding: encoding
    };

    if (!excludeConfig) {
      spec.config = duplicate(this.config);
    }

    if (!excludeData) {
      spec.data = duplicate(this.data);
    }

    // remove defaults
    return spec;
  }

  public mark(): Mark {
    return this.markDef.type;
  }

  public channelHasField(channel: Channel) {
    return vlEncoding.channelHasField(this.encoding, channel);
  }

  public fieldDef(channel: SingleDefChannel): FieldDef<string> {
    const channelDef = this.encoding[channel] as ChannelDef<string>;
    return getFieldDef(channelDef);
  }

  /** Get "field" reference for vega */
  public field(channel: SingleDefChannel, opt: FieldRefOption = {}) {
    const fieldDef = this.fieldDef(channel);

    if (!fieldDef) {
      return undefined;
    }

    if (fieldDef.bin) { // bin has default suffix that depends on scaleType
      opt = extend({
        binSuffix: this.hasDiscreteDomain(channel) ? 'range' : 'start'
      }, opt);
    }

    return field(fieldDef, opt);
  }
}
