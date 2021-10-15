const PromClient = require("prom-client");
const MongoClient = require("mongodb").MongoClient;
var cors = require('cors')
/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
const DB_URI = process.env.DB_URI;
const LEADERBOARD = process.env.LEADERBOARD || false;
const maintainers = [
  "anirudhRowjee",
  "NavinShrinivas",
  "aarav-babu",
  "suhaskv1",
  "Skanda-hue",
  "Mohamed-Ayaan358",
  "shriyays",
  "aditi-singh2",
  "Manab784",
  "thecoderash",
  "preethika-ajay",
  "jagriti-bhatia",
  "squirrellovespie",
  "aditikiran",
  "AyushmaanKaushik",
  "Noel-Saju",
  "rimzimsanghvi",
  "neerajsudheer",
  "karunakc",
  "nevasini",
  "jeff10joy",
  "gall1frey",
  "pk-95",
  "ArnavKumar7",
  "thelastCube",
];

// ------- Prometheus for Monitoring
const register = new PromClient.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'example-nodejs-app'
})
// Create a custom histogram metric
const httpRequestTimer = new PromClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10] // 0.1 to 10 seconds
});
PromClient.collectDefaultMetrics({ register })


// ------ MongoDB 
const db_client = new MongoClient(DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
console.log("Connected to MongoDB with ", db_client);

// parse the comment to ensure it's by a maintainer, and that it's a bounty assignment comment
function validate_bounty_comment(comment_body, issuer, maintainers) {
  if (comment_body.split(" ")[0].toLowerCase() == "!bounty" && maintainers.includes(issuer))
  {
    return true;
  }
  else
  {
    return false;
  }
}

// read the context object to get all relevant information
function parse_slim_object(context)
{
  var slim_object = {
    html_url : context.payload.issue.html_url,
    sender : context.payload.sender.login,
    body : context.payload.comment.body,
    contributor : context.payload.issue.user.login,
    author_association : context.payload.comment.author_association,
    timestamp : context.payload.comment.created_at,
    repository: context.payload.repository.full_name,
  }
  return slim_object;
}

async function assign_bounty(client, {contributor, sender, bounty, timestamp, repository, issue_number, html_url})
{
    await client.connect();
    const collection = await client
      .db("Hacktoberfest2020", { returnNonCachedInstance: true })
      .collection("BountyData2");
    r = await collection.updateOne(
      { html_url: html_url },
      { $set: {
          contributor: contributor,
          maintainer: sender,
          points: bounty,
          timestamp: timestamp,
          repository: repository,
          issue_number: issue_number
        },
      },
      { upsert: true }
    );
}


async function get_leaderboard_JSON(client)
{
    await client.connect();
    const final_json = await client
      .db("Hacktoberfest2020", { returnNonCachedInstance: true })
      .collection("BountyData2").find().toArray();
    final_array_json = await JSON.stringify(final_json)
    // console.log(final_json);
    return final_json;
}

function get_bounty(text)
{
  // return the text value of the bounty
  return text.split(" ")[1];
}

module.exports = (app, { getRouter }) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");
  const router = getRouter('/leaderboard');
  router.use(cors({
    origin: "*"
  }))

  // add leaderboard
  router.get("/", async (req, res) => {

    // check to see if leaderboard flag is set
    if (LEADERBOARD)
    {
      const end = httpRequestTimer.startTimer();
      const route = "/";
      // query DB
      var final_json = await get_leaderboard_JSON(db_client);
      res.send(final_json);
      end({route, code: res.statusCode, method: req.method });
    }
    else
    {
      // no go
      res.status(404).send("Nice Try :) consider applying to ACM.");
    }


  })

  router.get('/metrics', async (req, res) => {
      const end = httpRequestTimer.startTimer();
      const route = "/";
      res.setHeader('Content-Type', register.contentType);
      res.send(await register.metrics());
      end({route, code: res.statusCode, method: req.method });
  });

  // General Greeting Message for Issues.
  app.on("issues.opened", async (context) => {

    context.log.info(`Issue Created on Repo ${context.payload.repository.full_name} by ${context.payload.sender.login}`);
    console.log(`Issue Created on Repo ${context.payload.repository.full_name} by ${context.payload.sender.login}`);


    // check if maintainer opened an issue
    if (!maintainers.includes(context.payload.sender.login))
    {
      const issueComment = context.issue({
          body: "Thank you for opening this Issue 😁!  A Maintainer will check this out soon. Until then, hold tight!",
      });
      return context.octokit.issues.createComment(issueComment);
    }
  });


  // check for a comment on pull request
  app.on("pull_request.opened", async (context) => {

    context.log.info(`Pull Request Created on Repo ${context.payload.repository.full_name} by ${context.payload.sender.login}`);
    console.log(`Pull Request Created on Repo ${context.payload.repository.full_name} by ${context.payload.sender.login}`);

    // manufacture the PR Comment
    const PRComment = context.issue({
      body: `Hi, @${context.payload.sender.login}! Thank you for your Pull Request 🥳🚀 A Maintainer will review your PR Shortly. Till then, hold tight!`
    });

    // send it!
    return context.octokit.issues.createComment(PRComment);
  });


  // make the bounty issue
  app.on("issue_comment", async (context) => {


    // get the slim context object
    var slim_context = parse_slim_object(context);
    console.log("The Issue was commented on!");

    // console.log(context)

    // parse the comment to ensure it's a bounty assignment comment
    if (validate_bounty_comment(slim_context.body, slim_context.sender, maintainers))
    {
      var bounty = get_bounty(slim_context.body);
      var issue_number = context.payload.issue.number;
      // console.log(context);
      console.log(slim_context);


      var bounty_object = {
        contributor: slim_context.contributor, 
        sender: slim_context.sender, 
        bounty: bounty, 
        timestamp: slim_context.timestamp, 
        repository: slim_context.repository, 
        issue_number:  issue_number,
        html_url: slim_context.html_url,
      }
      console.log(bounty_object);

      context.log.info(`${bounty_object.sender} has requested to assign ${bounty} Bounty Points to ${bounty_object.contributor}`);
      console.log(`${bounty_object.sender} has requested to assign ${bounty} Bounty Points to ${bounty_object.contributor}`);

      // assign the points
      await assign_bounty(db_client, bounty_object);

      const params = context.issue({
        body:
        "Congrats @" + slim_context.contributor + " 🥳🥳🚀🚀, you got " + bounty + " Bounty Points! Check out the Leaderboard to see your new score 😁",
      });
      return context.octokit.issues.createComment(params);

    }

  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
