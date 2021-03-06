import {Channel, SingleDefChannel} from '../../../channel';
import * as log from '../../../log';
import {SelectionDef} from '../../../selection';
import {TransformCompiler} from './transforms';

const project:TransformCompiler = {
  has: function(selDef: SelectionDef) {
    return selDef.fields !== undefined || selDef.encodings !== undefined;
  },

  parse: function(model, selDef, selCmpt) {
    let fields = {};
    // TODO: find a possible channel mapping for these fields.
    (selDef.fields || []).forEach((field) => fields[field] = null);
    (selDef.encodings || []).forEach((channel: SingleDefChannel) => {
      const fieldDef = model.fieldDef(channel);
      if (fieldDef) {
        if (fieldDef.timeUnit) {
          fields[model.field(channel)] = channel;
        } else {
          fields[fieldDef.field] = channel;
        }
      } else {
        log.warn(log.message.cannotProjectOnChannelWithoutField(channel));
      }
    });

    const projection = selCmpt.project || (selCmpt.project = []);
    for (const field in fields) {
      if (fields.hasOwnProperty(field)) {
        projection.push({field: field, encoding: fields[field]});
      }
    }

    fields = selCmpt.fields || (selCmpt.fields = {});
    projection.filter((p) => p.encoding).forEach((p) => fields[p.encoding] = p.field);
  }
};

export {project as default};
