import $ from 'jquery';
import _ from 'underscore';
import BaseVw from './baseVw';
import loadTemplate from '../utils/loadTemplate';
import app from '../app';
import { followedByYou, followUnfollow } from '../utils/follow';
import Profile, { getCachedProfiles } from '../models/profile/Profile';
import { launchModeratorDetailsModal } from '../utils/modalManager';
import { openSimpleMessage } from './modals/SimpleMessage';

export default class extends BaseVw {
  constructor(options = {}) {
    super(options);
    this.options = options;

    if (this.model instanceof Profile) {
      this.guid = this.model.id;
      this.fetched = true;
    } else {
      this.guid = options.guid;
      this.fetched = false;
    }

    if (!this.guid) {
      if (this.model) {
        throw new Error('The guid must be provided in the model.');
      } else {
        throw new Error('The guid must be provided in the options.');
      }
    }

    this.ownGuid = this.guid === app.profile.id;
    this.followedByYou = followedByYou(this.guid);

    this.loading = !this.fetched;
    this.settings = app.settings.clone();

    this.listenTo(this.settings, 'sync', () => {
      app.settings.set(this.settings.toJSON());
    });

    this.listenTo(app.settings, 'change:storeModerators', () => {
      this.$modBtn.toggleClass('active', this.ownMod);
      this.$modBtn.attr('data-tip', this.getModTip());
    });

    this.listenTo(app.ownFollowing, 'update', (cl, updateOpts) => {
      const updatedModels = updateOpts.changes.added.concat(updateOpts.changes.removed);

      if (updatedModels.filter(md => md.id === this.guid).length) {
        this.followedByYou = followedByYou(this.guid);
        this.$followBtn.toggleClass('active', this.followedByYou);
        this.$followBtn.attr('data-tip', this.getFollowTip());
      }
    });
  }

  get ownMod() {
    return app.settings.ownMod(this.guid);
  }

  getModTip(ownMod = this.ownMod) {
    return ownMod ?
      `${app.polyglot.t('userShort.tipModRemove')}` :
        `${app.polyglot.t('userShort.tipModAdd')}`;
  }

  getFollowTip(isFollowedByYou = this.followedByYou) {
    return isFollowedByYou ?
      `${app.polyglot.t('userShort.tipUnfollow')}` :
        `${app.polyglot.t('userShort.tipFollow')}`;
  }

  loadUser(guid = this.guid) {
    this.fetched = true;

    if (guid === app.profile.id) {
      // don't fetch this user's own profile, since we have it already
      this.profileFetch = $.Deferred().resolve(app.profile);
    } else {
      this.profileFetch = getCachedProfiles([guid])[0];
    }

    this.profileFetch.done(profile => {
      if (this.isRemoved()) return;
      this.loading = false;
      this.notFound = false;
      this.model = profile;
      this.render();
    }).fail(() => {
      if (this.isRemoved()) return;
      this.loading = false;
      this.notFound = true;
      this.render();
    });
  }

  className() {
    return 'userCard';
  }

  attributes() {
    // make it possible to tab to this element
    return { tabIndex: 0 };
  }

  events() {
    return {
      'click .js-userName': 'nameClick',
      'click .js-follow': 'followClick',
      'click .js-mod': 'modClick',
      'click .js-imageHeader': 'nameClick',
    };
  }

  nameClick() {
    this.navToUser();
  }

  followClick(e) {
    const type = this.followedByYou ? 'unfollow' : 'follow';

    this.$followBtn.addClass('processing');
    followUnfollow(this.guid, type)
      .always(() => (this.$followBtn.removeClass('processing')));

    e.stopPropagation();
  }

  modClick(e) {
    if (this.ownMod) {
      // remove this user from the moderator list
      this.$modBtn.addClass('processing');
      this.saveModeratorList(false);
    } else {
      // show the moderator details modal
      const modModal = launchModeratorDetailsModal({ model: this.model });
      this.listenTo(modModal, 'addAsModerator', () => {
        this.$modBtn.addClass('processing');
        this.saveModeratorList(true);
      });
    }

    e.stopPropagation();
  }

  onClickImageHeader() {
    this.navToUser();
  }

  navToUser() {
    app.router.navigate(`${this.guid}`, {
      trigger: true,
    });
  }

  saveModeratorList(add = false) {
    // clone the array, otherwise it is a reference
    let modList = _.clone(app.settings.get('storeModerators'));

    if (add && !this.ownMod) {
      modList.push(this.guid);
    } else {
      modList = _.without(modList, this.guid);
    }

    const formData = { storeModerators: modList };
    this.settings.set(formData);

    if (!this.settings.validationError) {
      this.settings.save(formData, {
        attrs: formData,
        type: 'PATCH',
      })
        .fail((...args) => {
          const errMsg = args[0] && args[0].responseJSON &&
              args[0].responseJSON.reason || '';
          const phrase = add ? 'userShort.modAddError' : 'userShort.modRemoveError';
          openSimpleMessage(app.polyglot.t(phrase), errMsg);
        })
        .always(() => {
          this.$modBtn.removeClass('processing');
        });
    }
  }

  get $followBtn() {
    return this._$followBtn ||
        (this._$followBtn = this.$('.js-follow'));
  }

  get $modBtn() {
    return this._$modBtn ||
        (this._$modBtn = this.$('.js-mod'));
  }

  render() {
    loadTemplate('userCard.html', (t) => {
      this.$el.html(t({
        loading: this.loading,
        notFound: this.notFound,
        guid: this.guid,
        ownGuid: this.ownGuid,
        followedByYou: this.followedByYou,
        ownMod: this.ownMod,
        getModTip: this.getModTip,
        getFollowTip: this.getFollowTip,
        ...this.options,
        ...(this.model && this.model.toJSON() || {}),
      }));

      this._$followBtn = null;
      this._$modBtn = null;

      if (!this.fetched) this.loadUser();
      /* the view should be rendered when it is created and before it has data, so it can occupy
       space in the DOM while the data is being fetched. */
    });

    return this;
  }

  remove() {
    if (this.profileFetch && this.profileFetch.abort) this.profileFetch.abort();
    super.remove();
  }
}
