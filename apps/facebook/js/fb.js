function userDataReady(userData) {
  window.console.log('UserData:',userData);
  var ele = document.querySelector("p strong");
  ele.textContent = userData.name;

  ele = document.querySelector('img');

  ele.src = 'https://graph.facebook.com/me/picture' + '?' +
  'access_token=' + accessToken;
}

function friendsReady(friendsData) {
  window.console.log('Friends:',friendsData);

  var myFriends = friendsData.data;
  var number = myFriends.length;

  var list = document.querySelector('ul');
  var list2 = document.querySelector('ol');

  list.hidden = false;
  list2.hidden = true;
  for(var c = 0; c < number; c++) {
      list.innerHTML += ('<li>' + '<img src="' +
                         'https://graph.facebook.com/' +
                          + myFriends[c].id +
                         '/picture"' +
                         '?access_token=' + accessToken +
                          '>' +
                         '<a href="#" onclick="getFoF()">'
                          + myFriends[c].name + '</a>');
  }
}

function newsReady(newsData) {
  var myNews = newsData.data;
  var number = myNews.length;

  var list = document.querySelector('ol');
  var list2 = document.querySelector('ul');
  list.hidden = false;
  list2.hidden = true;

  for(var c = 0; c < number; c++) {
    var msg = myNews[c].story;
    if(!msg || msg.length === 0) {
      msg = myNews[c].message;
    }

    if(msg && msg.length > 0) {
    list.innerHTML +=  ('<li style="width: 100%; margin: 4px:0; float:left"><dl><dt><img style="float:left" src="' +
                        'https://graph.facebook.com/' +
                            + myNews[c].from.id + '/picture' +
                            '?access_token=' + accessToken +
                        '"><b>' +  myNews[c].from.name + '</b></dt>' +
  '<dd>' + msg + '</dd></dl></li>'); }
  }

  if(document.location.toString().indexOf('preview=1') !== -1) {
    document.body.dataset.state = 'preview';
    document.documentElement.dataset.state = 'preview';
  }
}

function fofReady(friendsData) {

}

function getFriends() {
  var friendsService = 'https://graph.facebook.com/me/friends?';

  params = ['access_token=' + accessToken,
                        'callback=friendsReady'];

  q = params.join('&');

  jsonp = document.createElement('script');
  jsonp.src = friendsService + q;
  document.body.appendChild(jsonp);
}

function getNews() {
  var newsService = 'https://graph.facebook.com/me/home?';

  var now = Date.now();
  var since = now - 2 * 60 * 60 * 1000;

  var params = ['access_token=' + accessToken,
                          'callback=newsReady','limit=6'];

  var q = params.join('&');

  var jsonp = document.createElement('script');
  jsonp.src = newsService + q;
  document.body.appendChild(jsonp);
}

function logout() {
  window.console.log('Logout');

  document.location =
  'https://m.facebook.com/logout.php?next=' +
      encodeURIComponent(window.location + "?logout=1") + '&access_token='
      + accessToken;

  window.localStorage.removeItem('access_token');
}
