import { inject as service } from '@ember/service'
import Route from '@ember/routing/route'
import { get } from '@ember/object'
import { isEmpty } from '@ember/utils'
import AuthenticatedRouteMixin from 'ember-simple-auth/mixins/authenticated-route-mixin'
import HandlesSaveWithFlashMixin from 'echo-front/mixins/handles-save-with-flash'
import { mutations } from 'echo-front/graphql/unidentified_playback_group'
import { queries as worklistQueries } from 'echo-front/graphql/worklist-recordings'
import { queries as externalQueries } from 'echo-front/graphql/external-recordings'

// Prefill the Ember Model with data from graphql.
const prefill = (store, item) => {
  const recording = store.createRecord('recording')
  recording.set('title', item.title)
  recording.set('mainArtist', item.mainArtist)
  recording.set('durationInSeconds', item.duration || item.durationInSeconds)
  recording.set('isrc', item.isrc)
  recording.set('recordLabel', item.recordLabel)

  const recordingCountryId = get(item, 'recordingCountry.id') || get(item, 'recordedIn.id')
  if (recordingCountryId) {
    store.findRecord('country', recordingCountryId).then((country) => {
      recording.set('recordedIn', country)
    })
  }

  const productionCountryId = get(item, 'productionCountry.id')
  if (productionCountryId) {
    store.findRecord('country', productionCountryId).then((country) => {
      recording.set('producedIn', country)
    })
  }

  recording.set('recordingDate', item.recordingDate)
  recording.set('releaseDate', item.releaseDate)
  recording.set('source', item.source)
  recording.set('sourceId', item.sourceId)
  recording.set('sourceId', item.sourceId)

  recording.set('draftContributors', get(item, 'contributors'))
  recording.set('draftTracks', get(item, 'tracks'))

  return {recording, item}
}

const getRecordingFromSource = (graphql, id, source = null) => {
  if (source === 'recording_drafts') {
    return externalQueries.externalRecording(graphql, source, id)
  }

  return worklistQueries.worklistRecording(graphql, id)
}

export default Route.extend(AuthenticatedRouteMixin, HandlesSaveWithFlashMixin, {
  graphql: service(),

  async beforeModel(transition) {
    return this._replaceTransitionWithWorklistRecordingIfRelevantAndExist(transition)
  },

  model(params) {
    if (!params.prefill) { return this.store.createRecord('recording') }

    return getRecordingFromSource(this.get('graphql'), params.prefill, params.prefillSource)
      .then(item => {
        if (item == null) { throw new Error(`Unknown prefill id "${params.prefill}"`) }
        return item
      })
      .then(item => prefill(this.store, item))
      .then(({recording, item}) => {
        this.set('broadcasterRecordings', item.broadcasterRecordings)
        return recording
      })
      .catch(err => {
        console.warn(`Ignoring error: "${err}"`) // eslint-disable-line
        this.transitionTo({queryParams: {prefill: null}})
        return this.store.createRecord('recording')
      })
  },

  setupController(controller, model) {
    this._super(controller, model)
    controller.set('broadcasterRecordings', this.get('broadcasterRecordings'))
  },

  resetController(controller, isExiting) {
    if (isExiting) { controller.resetPrefill() }
  },

  actions: {
    transitionToShow() {
      const transitionUrl = this.get('controller.transitionUrl')

      if (transitionUrl) {
        this.send('closeCurrentTabTransitionTo', transitionUrl)
      } else {
        this.send('closeCurrentTabTransitionTo', 'discography.recordings.show', this.currentModel)
      }
    },

    matchUnidentifiedPlaybackGroups(recording_id, upgs = []) {
      if (!upgs.length) { return this.send('transitionToShow') }

      mutations
        .identify(
          this.get('graphql'),
          'recordings',
          recording_id,
          upgs.map(upg => upg.id)
        )
        .then(() => this.send('transitionToShow'))
    },

    onSaveSuccess(recording_id) {
      this.send('matchUnidentifiedPlaybackGroups', recording_id, this.get('broadcasterRecordings'))
    }
  },

  async _replaceTransitionWithWorklistRecordingIfRelevantAndExist(transition) {
    const worklistRecording = await this._getWorklistRecordingIfRelevant(transition)

    if (!worklistRecording) { return }

    transition.abort()
    this.replaceWith('discography.recordings.new', {queryParams: {
      prefill: worklistRecording.get('id'),
      prefillSource: 'worklist_recordings'
    }})
  },

  /**
   * Checks if transition is going to a prefill source and ID we
   * have a worklist recording for. The prefill source and ID could
   * potentially be something we have matched against, and if so this
   * can be found in worklist too.
   *
   * If it is in the worklist we return the worklist iten.
   *
   * @param  {[type]}  transition A transition we read query params from.
   * @return {Promise}            Resolves with worklist item, or undefined
   */
  async _getWorklistRecordingIfRelevant(transition) {
    const { prefill, prefillSource } = transition.queryParams

    if (
      isEmpty(prefillSource) ||
      isEmpty(prefill) ||
      prefillSource === 'worklist_recordings'
    ) { return }

    return worklistQueries.findBySource(
      this.get('graphql'), prefillSource, prefill
    )
  }
})
