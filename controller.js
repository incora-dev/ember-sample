import { computed } from '@ember/object'
import { equal, notEmpty } from '@ember/object/computed'
import Controller from '@ember/controller'

export default Controller.extend({
  // prefill is a worklist id for the entity that prefill data should
  // be collected from.
  queryParams: ['prefill', 'prefillSource', 'transitionUrl'], // eslint-disable-line
  prefill: null,
  prefillSource: null,
  transitionUrl: null,

  init() {
    this._super()
    this.resetPrefill()
  },

  isFromDraft: equal('prefillSource', 'recording_drafts'),
  isFromWorklist: equal('prefillSource', 'worklist_recordings'),
  hasSourceId: notEmpty('prefill'),
  showDraft: computed('isFromDraft', 'isFromWorklist', 'hasSourceId', function() {
    const {
      isFromDraft, isFromWorklist, hasSourceId
    } = this.getProperties('isFromDraft', 'isFromWorklist', 'hasSourceId')

    return hasSourceId && (isFromDraft || isFromWorklist)
  }),

  resetPrefill() {
    this.set('prefill', null)
    this.set('prefillSource', null)
  }
})
