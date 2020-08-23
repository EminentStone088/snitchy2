const args = require("minimist")(process.argv.slice(2));

if (!args.config) throw new Error("Please specify a config with --config!");
if (!args.code) throw new Error("Please specify a content code with --code!");

const path = require("path");
const config = require("./config");
config.loadConfig(path.join(process.cwd(), args.config));

const fs = require("fs");
const marked = require("marked");
const frontMatter = require("front-matter");
const childProcess = require("child_process");
const ejs = require("ejs");

const fastify = require("fastify");
const pump = require("pump");

if (config().https) console.log("Detected HTTPS in config! Enabling HTTPS and HTTP/2.0!");
const app = fastify(config().https ? {
	http2: true,
	https: {
		allowHTTP1: true,
		key: fs.readFileSync(config().https.key),
		cert: fs.readFileSync(config().https.cert),
		ca: config().https.chain ? fs.readFileSync(config().https.chain) : undefined
	}
} : {});

setInterval(() => {
	try {
		const out = childProcess.execSync("git pull", {
			cwd: path.join(__dirname, "..", "data", "articles")
		});

		if (out.indexOf("Already up to date.") !== -1) return;
		processArticles();
		console.log(`New out: ${out}`);
	} catch (err) {
		console.error(`Encountered error: ${err}`);
	}
}, 30000);

var articles = [];
const articlesRoot = path.join(__dirname, "..", "data", "articles");
function processArticles() {
	if (!fs.existsSync(path.join(__dirname, "..", "data"))) fs.mkdirSync(path.join(__dirname, "..", "data"));
	if (!fs.existsSync(articlesRoot)) childProcess.execSync("git clone https://github.com/snitchbcc/articles", {
		cwd: path.join(__dirname, "..", "data")
	});
	articles = [];
	for (const year of fs.readdirSync(articlesRoot).filter(_ => _.startsWith("20"))) {
		for (const month of fs.readdirSync(path.join(articlesRoot, year))) {
			for (const article of fs.readdirSync(path.join(articlesRoot, year, month))) {
				const contents = fs.readFileSync(path.join(articlesRoot, year, month, article)).toString();
				const fm = frontMatter(contents);
				articles.push({
					slug: article.slice(0, article.length - 3),
					title: fm.attributes.title,
					authors: fm.attributes.authors,
					date: {
						year: parseInt(year),
						month: parseInt(month),
						day: fm.attributes.date
					},
					thumbnail: fm.attributes.thumbnail ? (fm.attributes.thumbnail.startsWith("content://") ? `/content/${fm.attributes.thumbnail.slice(10)}` : fm.attributes.thumbnail) : undefined,
					date_js: new Date(parseInt(year), parseInt(month), fm.attributes.date),
					tags: fm.attributes.tags,
					series: fm.attributes.series,
					body: fm.body,
					rendered: marked(fm.body)
				});
			}
		}
	}
}

app.register(
	require("fastify-compress"),
	{ global: true }
);
app.register(require("fastify-static").default, {
	root: path.join(__dirname, "..", "static"),
});
app.register(require("fastify-multipart"));

processArticles();

function render(name, data) {
	return ejs.renderFile(path.join(__dirname, "..", "views", name), {
		months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul","Aug", "Sep", "Oct", "Nov", "Dec"],
		getSeries(series) {
			return articles.filter(_ => _.series === series).sort((a, b) => a.date_js - b.date_js, 0);
		},
		...data
	}, {
		cache: false
	});
}

function push(req, res) {
	if (!req.raw.stream) return;

	// Fonts do weird flashy things in Chrome (crying emoji)
	// req.raw.stream.pushStream(
	// 	{ ":path": `/Inter-normal.woff2` },
	// 	(err, stream) => {
	// 		if (err) return;
	// 		stream.respondWithFile(path.join(__dirname, "../static/Inter-normal.woff2"), {
	// 		"content-type": "application/font-woff2",
	// 		"cache-control": "public, max-age=0"
	// 	});
	// }
	// );

	req.raw.stream.pushStream(
		{ ":path": `/style.css` },
		(err, stream) => {
			if (err) return;
			stream.respondWithFile(path.join(__dirname, "../static/style.css"), {
			"content-type": "text/css",
			"cache-control": "public, max-age=0"
		});
	}
	);

	req.raw.stream.pushStream(
		{ ":path": `/img/tophat.svg` },
		(err, stream) => {
			if (err) return;
			stream.respondWithFile(path.join(__dirname, "../static/img/tophat.svg"), {
			"content-type": "image/svg+xml",
			"cache-control": "public, max-age=0"
		});
	}
	);
}

app.get("/", (req, res) => {
	res.type("text/html").code(200);	
	push(req, res);
	return render("section.ejs", {
		articles,
		tag: "featured",

		title: "The Latest",
		description: "Democracy bumps into things in darkness."
	});
});

app.get("/search", (req, res) => {
	if (!req.query.q)
		return res.redirect("/");

	res.type("text/html").code(200);
	push(req, res);
	return render("search.ejs", {
		articles,

		query: req.query.q
	});
});

app.get("/advice", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("section.ejs", {
		articles,
		tag: "advice",

		title: "Advice",
		description: "Let us solve your many, many problems."
	});
});

app.get("/local", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("section.ejs", {
		articles,
		tag: "local",

		title: "Local",
		description: "Like gossip, but two weeks late!"
	});
});

app.get("/politics", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("section.ejs", {
		articles,
		tag: "politics",

		title: "Politics",
		description: "Piss off your extended family."
	});
});

app.get("/culture", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("section.ejs", {
		articles,
		tag: "culture",

		title: "Culture",
		description: "Half as much culture as your yogurt."
	});
});

app.get("/about", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("about.ejs");
});

app.get("/contact", (req, res) => {
	res.type("text/html").code(200);
	push(req, res);
	return render("contact.ejs");
});

app.get("/discord", (req, res) => {
	res.redirect("https://discord.gg/GxkM9bu");
});

app.get("/article/:slug", (req, res) => {
	const article = articles.find(_ => _.slug === req.params.slug);
	if (!article) return res.redirect("/");

	res.type("text/html").code(200);
	return render("article.ejs", {
		article
	});
});

cubehash=(function(){var c,d,e,f,g,h,i,j,r,k,l,m,o;g=256;c=[g/8,32,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];k=function(r,s){for(i=0;i<16;i+=1){c[16+i]+=c[i];c[i]=(c[i]<<r)^(c[i]>>>s)}};l=function(a,b){for(i=0;i<16;i+=1){if(i&a){j=i^a;h=c[i]^c[j+16];c[i]=c[j]^c[i+16];c[j]=h}}for(i=16;i<32;i+=1){if(i&b){j=i^b;h=c[i];c[i]=c[j];c[j]=h}}};d=function(n){n*=16;for(r=0;r<n;r+=1){k(7,25);l(8,2);k(11,21);l(4,1)}};d(10);f=c.slice(0);m=function(n){return("00"+n.toString(16)).slice(-2)};o=function(n){return m(n&255)+m(n>>>8)+m(n>>>16)+m(n>>>24)};return function(a){var b,i;c=f.slice(0);a+="\u0080";while(a.length%16>0){a+="\u0000"}e=[];for(i=0;i<a.length;i+=2){e.push(a.charCodeAt(i)+a.charCodeAt(i+1)*0x10000)}for(b=0;b<e.length;b+=8){for(i=0;i<8;i+=1){c[i]^=e[b+i]}d(1)}c[31]^=1;d(10);return c.map(o).join("").substring(0,g/4)}}());
const content_root = path.join(__dirname, "..", "static", "content");
app.get("/content", (req, res) => {
	let f = {};
	for (const file of fs.readdirSync(content_root)) {
		f[file] = cubehash([...fs.readFileSync(path.join(content_root, file))].map(_ => String.fromCharCode(_)).join(""));
	}
	return f;
});

app.post("/content", (req, res) => {
	if (!req.isMultipart()) {
		reply.code(400).send(new Error("Request is not multipart"));
		return;
	}
		
	if (req.query.code !== args.code) {
		console.log(`Invalid content code - got: ${req.query.code}, expected: ${args.code}`);
		res.code(401).send(new Error("Invalid code"));
		return;
	}

	req.multipart(handler, onEnd);

	function onEnd() {
		console.log("upload completed");
		res.code(200).send();
	}

	function handler (field, file, filename, encoding, mimetype) {
		console.log(filename);
		pump(file, fs.createWriteStream(path.join(content_root, filename)));
	}
});

app.listen(config().port, "0.0.0.0", (err, address) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.info(`server listening on ${address}!`);
});

process.on("uncaughtException", err => {
	console.error(err);
});

if (config().redirect_from_http)
require("http")
.createServer(function(req, res) {
  const {
	headers: { host },
	url
  } = req;      
  if (host) {
	const redirectUrl = `https://${host.split(":")[0]}${url}`;
	res.writeHead(301, {
	  Location: redirectUrl
	});
	res.end();
  }
})
.listen(80);
