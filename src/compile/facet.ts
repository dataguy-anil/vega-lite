import {Channel, COLUMN, NonspatialScaleChannel, ROW, ScaleChannel} from '../channel';
import {Config} from '../config';
import {reduce} from '../encoding';
import {Facet} from '../facet';
import {FieldDef, normalize, title as fieldDefTitle} from '../fielddef';
import * as log from '../log';
import {FILL_STROKE_CONFIG} from '../mark';
import {initFacetResolve, ResolveMapping} from '../resolve';
import {Scale} from '../scale';
import {FacetSpec} from '../spec';
import {contains, Dict, keys, stringValue} from '../util';
import {VgAxis} from '../vega.schema';
import {VgDomain, VgMarkGroup, VgScale, VgSignal} from '../vega.schema';
import {
  isDataRefDomain,
  isDataRefUnionedDomain,
  isFieldRefUnionDomain,
  VgData,
  VgDataRef,
  VgEncodeEntry,
  VgLayout
} from '../vega.schema';
import {applyConfig, buildModel, formatSignalRef} from './common';
import {assembleData, assembleFacetData, FACET_SCALE_PREFIX} from './data/assemble';
import {parseData} from './data/parse';
import {getHeaderType, HeaderChannel, HeaderComponent} from './layout/header';
import {labels} from './legend/encode';
import {moveSharedLegendUp} from './legend/parse';
import {Model, ModelWithField} from './model';
import {RepeaterValue, replaceRepeaterInFacet} from './repeat';
import {ScaleComponent, ScaleComponentIndex} from './scale/component';


export class FacetModel extends ModelWithField {
  public readonly facet: Facet<string>;

  public readonly child: Model;

  public readonly children: Model[];

  constructor(spec: FacetSpec, parent: Model, parentGivenName: string, repeater: RepeaterValue, config: Config) {
    super(
      spec, parent, parentGivenName, config,
      initFacetResolve(spec.resolve || {})
    );


    this.child = buildModel(spec.spec, this, this.getName('child'), undefined, repeater, config);
    this.children = [this.child];

    const facet: Facet<string> = replaceRepeaterInFacet(spec.facet, repeater);

    this.facet = this.initFacet(facet);
  }

  private initFacet(facet: Facet<string>): Facet<string> {
    // clone to prevent side effect to the original spec
    return reduce(facet, function(normalizedFacet, fieldDef: FieldDef<string>, channel: Channel) {
      if (!contains([ROW, COLUMN], channel)) {
        // Drop unsupported channel
        log.warn(log.message.incompatibleChannel(channel, 'facet'));
        return normalizedFacet;
      }

      if (fieldDef.field === undefined) {
        log.warn(log.message.emptyFieldDef(fieldDef, channel));
        return normalizedFacet;
      }

      // Convert type to full, lowercase type, or augment the fieldDef with a default type if missing.
      normalizedFacet[channel] = normalize(fieldDef, channel);
      return normalizedFacet;
    }, {});
  }

  public channelHasField(channel: Channel): boolean {
    return !!this.facet[channel];
  }

  public hasDiscreteDomain(channel: Channel) {
    return true;
  }

  public fieldDef(channel: Channel): FieldDef<string> {
    return this.facet[channel];
  }

  public parseData() {
    this.component.data = parseData(this);
    this.child.parseData();
  }

  public parseSelection() {
    // As a facet has a single child, the selection components are the same.
    // The child maintains its selections to assemble signals, which remain
    // within its unit.
    this.child.parseSelection();
    this.component.selection = this.child.component.selection;
  }

  public parseMarkGroup() {
    this.child.parseMarkGroup();

    // if we facet by two dimensions, we need to add a cross operator to the aggregation
    // so that we create all groups
    const isCrossedFacet = this.channelHasField(ROW) && this.channelHasField(COLUMN);
    this.component.mark = [{
      name: this.getName('cell'),
      type: 'group',
      from: {
        facet: {
          name: this.component.data.facetRoot.name,
          data: this.component.data.facetRoot.data,
          groupby: [].concat(
            this.channelHasField(ROW) ? [this.field(ROW)] : [],
            this.channelHasField(COLUMN) ? [this.field(COLUMN)] : []
          ),
          ...(isCrossedFacet ? {aggregate: {
            cross: true
          }}: {})
        }
      },
      ...(isCrossedFacet ? {sort: {
        field: [this.field(ROW, {expr: 'datum'}), this.field(COLUMN, {expr: 'datum'})],
        order: ['ascending', 'ascending']
      }} : {}),
      encode: {
        update: getFacetGroupProperties(this)
      }
    }];
  }

  public parseAxisAndHeader() {
    this.child.parseAxisAndHeader();

    this.parseHeader('column');
    this.parseHeader('row');

    this.mergeChildAxis('x');
    this.mergeChildAxis('y');
  }

  private parseHeader(channel: HeaderChannel) {

    if (this.channelHasField(channel)) {
      const fieldDef = this.facet[channel];
      const header = fieldDef.header || {};
      let title = header.title !== undefined ?  header.title : fieldDefTitle(fieldDef, this.config);

      if (this.child.component.layoutHeaders[channel].title) {
        // merge title with child to produce "Title / Subtitle / Sub-subtitle"
        title += ' / ' + this.child.component.layoutHeaders[channel].title;
        this.child.component.layoutHeaders[channel].title = null;
      }

      this.component.layoutHeaders[channel] = {
        title,
        fieldRef: formatSignalRef(fieldDef, header.format, 'parent', this.config, true),
        // TODO: support adding label to footer as well
        header: [this.makeHeaderComponent(channel, true)]
      };
    }
  }

  private makeHeaderComponent(channel: HeaderChannel, labels: boolean): HeaderComponent {
    const sizeChannel = channel === 'row' ? 'height' : 'width';

    return {
      labels,
      sizeSignal: this.child.getSizeSignalRef(sizeChannel),
      axes: []
    };
  }

  private mergeChildAxis(channel: 'x' | 'y') {
    const {child} = this;
    if (child.component.axes[channel]) {
      if (this.resolve[channel].axis === 'shared') {
        // For shared axis, move the axes to facet's header or footer
        const headerChannel = channel === 'x' ? 'column' : 'row';

        const layoutHeader = this.component.layoutHeaders[headerChannel];
        for (const axisComponent of child.component.axes[channel]) {
          const mainAxis = axisComponent.main;
          const headerType = getHeaderType(mainAxis.get('orient'));
          layoutHeader[headerType] = layoutHeader[headerType] ||
            [this.makeHeaderComponent(headerChannel, false)];

          // LayoutHeader no longer keep track of property precedence, thus let's combine.
          layoutHeader[headerType][0].axes.push(mainAxis.combine() as VgAxis);
          delete axisComponent.main;
        }
      } else {
        // Otherwise do nothing for independent axes
      }
    }
  }

  public parseLegend() {
    this.child.parseLegend();

    this.component.legends = {};
    keys(this.child.component.legends).forEach((channel: NonspatialScaleChannel) => {
      if (this.resolve[channel].legend === 'shared') {
        moveSharedLegendUp(this.component.legends, this.child, channel);
      }
    });
  }

  public assembleData(): VgData[] {
    if (!this.parent) {
      // only assemble data in the root
      return assembleData(this.component.data);
    }

    return [];
  }

  public assembleParentGroupProperties(): any {
    return null;
  }

  public assembleSelectionTopLevelSignals(signals: any[]): VgSignal[] {
    return this.child.assembleSelectionTopLevelSignals(signals);
  }

  public assembleSelectionSignals(): VgSignal[] {
    this.child.assembleSelectionSignals();
    return [];
  }

  public assembleSelectionData(data: VgData[]): VgData[] {
    return this.child.assembleSelectionData(data);
  }

  public assembleLayout(): VgLayout {
    const columns = this.channelHasField('column') ? {
      signal: this.columnDistinctSignal()
    } : 1;

    // TODO: determine default align based on shared / independent scales

    return {
      padding: {row: 10, column: 10},

      // TODO: support offset for rowHeader/rowFooter/rowTitle/columnHeader/columnFooter/columnTitle
      offset: 10,
      columns,
      bounds: 'full'
    };
  }

  public assembleLayoutSignals(): VgSignal[] {
    // FIXME(https://github.com/vega/vega-lite/issues/1193): this can be incorrect if we have independent scales.
    return this.child.assembleLayoutSignals();
  }

  private columnDistinctSignal() {
    // In facetNode.assemble(), the name is always this.getName('column') + '_layout'.
    const facetLayoutDataName = this.getName('column') + '_layout';
    const columnDistinct = this.field('column',  {prefix: 'distinct'});
    return `data('${facetLayoutDataName}')[0][${stringValue(columnDistinct)}]`;
  }

  public assembleMarks(): VgMarkGroup[] {
    const facetRoot = this.component.data.facetRoot;
    const data = assembleFacetData(facetRoot);

    const mark = this.component.mark[0];

    // correct the name of the faceted data source
    mark.from.facet = {
      ...mark.from.facet,
      name: facetRoot.name,
      data: facetRoot.data
    };

    const marks = [{
      ...(data.length > 0 ? {data: data} : {}),
      ...mark,
      ...this.child.assembleGroup()
    }];

    return marks;
  }

  protected getMapping() {
    return this.facet;
  }
}

function getFacetGroupProperties(model: FacetModel) {
  const encodeEntry = model.child.assembleParentGroupProperties();

  return {
    ...(encodeEntry ? encodeEntry : {}),
    ...applyConfig({}, model.config.facet.cell, FILL_STROKE_CONFIG.concat(['clip']))
  };
}
