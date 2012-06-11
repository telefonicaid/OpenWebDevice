function errorHandler(msg,url,lineNumber) {
			var str = '';

			if(url) {
				str += url + " : ";
			}

			if(lineNumber) {
				str += lineNumber + " : ";
			}

			if(msg) {
				str += msg;
			}

			window.console.log(str);

			return false;
		}

window.onerror = errorHandler;
