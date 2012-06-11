/*
 *  Module: Facebook integration
 *
 *  Product: Open Web Device
 *
 *  Copyright(c) 2012 Telefónica I+D S.A.U.
 *
 *  LICENSE: TBD
 *
 *  @author José M. Cantera (jmcf@tid.es)
 *
 *  The module allows to work with Facebook providing a deep integration
 *  between the Open Web Device and Facebook
 *
 *
 */
if(typeof window.owdFbInt === 'undefined') {
  (function(document) {
    'use strict';

    var owdFbInt = window.owdFbInt = {};

      // The access token
      var accessToken;
      // Application Id
      var appID = '323630664378726';
      // hash to get the token
      var hash = window.location.hash;
      // Access Token parameter
      var ACC_T = 'access_token';

      // Oauth dialog URI
      var oauthDialogUri = 'https://m.facebook.com/dialog/oauth?';

      // Contacts selected to be sync to the address book
      var selectedContacts = [];

      // The whole list of friends as an array
      var myFriends;

      // Query that retrieves the information about friends
      var FRIENDS_QUERY = 'SELECT uid,name,birthday_date,email FROM user\
                WHERE uid in (SELECT uid1 FROM friend WHERE uid2=me()) ORDER BY name';

      var selButton = document.querySelector('#selunsel');
      var contactList = document.querySelector('#myFbContacts');

      // Canvas used to obtain the idata url images
      var canvas = document.createElement('canvas');
      canvas.hidden = true;

    /**
     *  Initialization function it tries to find an access token
     *
     */
    owdFbInt.init = function() {
      window.console.log("The hash is: ", hash);
      window.console.log('document.location.search: ',document.location.search);

      if(document.location.search.indexOf('redirect') !== -1
                        && document.location.toString().indexOf('logout') === -1) {

        window.console.log('Coming from a redirection!!!');
        owdFbInt.start();
      }
    }

    owdFbInt.start = function() {
      getAccessToken(tokenReady);
    }

    /**
     *  This function is invoked when a token is ready to be used
     *
     */
    function tokenReady(at) {
      accessToken = at;

      owdFbInt.getFriends();
    }

    function getLocation() {
      return (window.location.protocol + "//" + window.location.host + window.location.port +
      window.location.pathname);
    }

    /**
     *  Gets the Facebook friends by invoking Graph API using JSONP mechanism
     *
     */
    owdFbInt.getFriends = function() {
      var friendsService = 'https://graph.facebook.com/fql?';

      var params = [ACC_T + '=' + accessToken,
                    'q' + '=' + FRIENDS_QUERY,
                        'callback=owdFbInt.friendsReady'];
      var q = params.join('&');

      var jsonp = document.createElement('script');
      jsonp.src = friendsService + q;
      document.body.appendChild(jsonp);

      document.body.dataset.state = 'waiting';
    }

    /**
     *  Callback invoked when friends are ready to be used
     *
     *  TODO: Check when there is an error and the access token has to be renewed
     *
     */
    owdFbInt.friendsReady = function(response) {
      if(typeof response.error === 'undefined') {
        window.console.log('Friends:',response);

        myFriends = response.data;

        owd.templates.append('#myFbContacts',myFriends);

        document.body.dataset.state = '';
      }
      else {
        window.console.log('There has been an error, while retrieving friends'
                                                    ,response.error.message);
        if(response.error.code === 190) {
          window.console.log('Restarting the OAuth flow');
          startOAuth();
        }
      }
    }

    var UI = owdFbInt.ui = {};

    owdFbInt.ui.logout = function() {
      logout();
    };

    /**
     *  This function is invoked when the user starts the process of importing
     *
     */
    owdFbInt.ui.importAll = function(e) {
      window.console.log('Importing all the contacts');

      if(selectedContacts.length > 0) {
        owdFbInt.importAll(function() {
          window.console.log('All contacts have been imported');
          document.body.dataset.state = '';
          var req = navigator.mozContacts.find({});
          req.onsuccess = function(e) {
            window.console.log('Number of contacts:' , e.target.result.length);
          }
        });
      }
      else {
        window.console.log('No friends selected. Doing nothing');
      }
    }

    /**
     *  Invoked when the user selects all his friends
     *
     *
     */
    owdFbInt.ui.selectAll = function(e) {
      window.console.log('Selecting all Contacts');

      bulkSelection(true);

      selButton.textContent = 'Unselect All';
      selButton.onclick = UI.unSelectAll;
    }

    /**
     *
     *  Invoked when the user unselects all her contacts
     *
     */
    owdFbInt.ui.unSelectAll = function(e)  {
      window.console.log('Unselecting all the contacts');

      bulkSelection(false);

      selButton.textContent = 'Select All';
      selButton.onclick = UI.selectAll;
    }

    /**
     *  Makes a bulk selection of the contacts
     *
     *
     */
    function bulkSelection(value) {
      window.console.log('Bulk Selection');

      var list = document.querySelector('#myFbContacts').
                              querySelectorAll('input[type="checkbox"]');

      var total = list.length;

      window.console.log('Total input: ',total);

      for(var c = 0; c < total; c++) {
        list[c].checked = value;

        if(value === true) {
          selectedContacts = myFriends.slice(0);
        }
        else {
          selectedContacts = [];
        }
      }
    }

    /**
     *  Performs Facebook logout
     *
     *
     */
    function logout() {
      window.console.log('Logout');
      clearStorage();

      document.location =
              'https://m.facebook.com/logout.php?next=' +
                  encodeURIComponent(getLocation() + "?logout=1")
                  + '&access_token=' + accessToken;
    }

    /**
     *  Clears credential data stored locally
     *
     */
    function clearStorage() {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('expires');
      window.localStorage.removeItem('ts_expires');
    }

    /**
     *   Invoked when an element in the friend list is selected
     *
     */
    owdFbInt.ui.selection = function(e) {
      var ele = e.target;
      window.console.log('Clicked!!!',ele.tagName);

      if(ele.tagName === 'INPUT') {
        if(ele.checked === true) {
          window.console.log('Contact has been selected',ele.name);
          selectedContacts.push(myFriends[ele.name]);
        }
        else {
            window.console.log('Contact has been unselected',ele.name);
            selectedContacts = selectedContacts.filter(function(e) {
              return e.uid !== myFriends[ele.name].uid;
            });
        }
      }
    }

    function getContactPhoto(uid) {
      var contactImg = getContactImg(uid);

      canvas.width = contactImg.width;
      canvas.height = contactImg.height;

      canvas.getContext('2d').drawImage(contactImg,0,0);

      return canvas.toDataURL();
    }

    function getContactImg(uid) {
      window.console.log('Uid to retrieve img for: ',uid);
      return contactList.querySelector('#c' + uid + ' img');
    }

    /**
     *  Imports all the selected contacts on the address book
     *
     */
    owdFbInt.importAll = function(importedCB) {
      document.body.dataset.state = 'waiting';

      var numResponses = 0;
      var totalContacts = selectedContacts.length;

      window.console.log('Total Contacts to add:',totalContacts);

      selectedContacts.forEach(function(f) {
        var contact = new mozContact();
        var photo = getContactPhoto(f.uid);

        contact.init({ name: [f.name], bday:null, fbContact:true, sex:f.uid, photo: [photo] });

        var request = navigator.mozContacts.save(contact);
        request.onsuccess = function() {
          numResponses++;
          window.console.log('Contact added!!!',numResponses);

          if(numResponses === totalContacts) {
            if(typeof importedCB === 'function') {
              importedCB();
            }
          }
        };

        request.onerror = function(e) {
          numResponses++;
          window.console.log('Contact Add error: ',numResponses);

          if(numResponses === totalContacts) {
            if(typeof importedCB === 'function') {
              importedCB();
            }
          }
        };

/*
        var storages = navigator.getDeviceStorage('pictures');

        if(storages.length > 0) {
          var stReq = storages[0].addNamed(contactImg,"fb/c" + f.uid);

          stReq.onsuccess = function() {
            window.console.log('FB Contact Image stored on DS',f.uid);
          };

          stReq.onerror = function() {
            window.console.log('Error while writing FB Contact Image to DS',f.uid);
          };
        }
        else {
          window.console.log('No storage to add FB contacts');
        } */

      });
    }

    /**
     *  Obtains the access token. The access token is retrieved from the local
     *  storage and if not present a OAuth 2.0 flow is started
     *
     *
     */
    function getAccessToken(ready) {
      var ret;

      if(typeof window.localStorage.access_token === 'undefined') {

        window.console.log('No access token stored!!!');

        var hash = window.location.hash;

        if(hash.length > 0) {
          if(hash.indexOf(ACC_T) === 1) {
            var end = hash.length;
            var expires = hash.indexOf('&');
            if(expires !== -1) {
                end = expires;
            }

            ret = hash.substring(ACC_T.length + 2,end);

            window.localStorage.access_token = ret;
            window.localStorage.expires = end * 1000;
            window.localStorage.token_ts = Date.now();

            window.console.log('Access Token %s. Expires: %s',ret,end);
          }
        } else {
          startOAuth();
        }
      }
      else {
        var timeEllapsed = Date.now() - window.localStorage.token_ts;

        if(timeEllapsed < window.localStorage.expires) {
           ret = window.localStorage.access_token;
           window.console.log('Reusing existing access token:',ret);
        }
        else {
          window.console.log('Access Token has expired');
          startOAuth();
        }
      }

      if(typeof ready === 'function' && typeof ret !== 'undefined') {
        ready(ret);
      }
    }

    /**
     *  Starts a OAuth 2.0 flow to obtain the user information
     *
     */
    function startOAuth() {
      clearStorage();

      var queryParams = ['client_id=' + appID,
                                'redirect_uri='
                                    + encodeURIComponent(getLocation() + "?state=redirect"),
                                'response_type=token',
                                'scope=' + encodeURIComponent('friends_about_me,friends_birthday,email')];
      var query = queryParams.join('&');
      var url = oauthDialogUri + query;

      window.console.log('URL: ', url);

      document.location = url;
    }

    window.console.log('OWD FB!!!!');

    // Everything is initialized
    owdFbInt.init();
  }
  )(document);
}
