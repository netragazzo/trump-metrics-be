const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const AWS = require('aws-sdk');
const moment = require('moment');

const USERS_TABLE = process.env.USERS_TABLE;
const METRICS_TABLE = process.env.METRICS_TABLE;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE;

const ROLES = [ 'ADMIN', 'EDITOR', 'CONTRIBUTOR', 'READER' ];

const IS_OFFLINE = process.env.IS_OFFLINE;
let dynamoDb;
if (IS_OFFLINE === 'true') {
    dynamoDb = new AWS.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    });
    console.log(dynamoDb);
} else {
    dynamoDb = new AWS.DynamoDB.DocumentClient();
};

app.use(bodyParser.json({strict: false}));

app.get('/', function (req, res) {
    res.send('Really fuck Trump!');
});

app.get('/user/:userId', function(req, res) {
    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: req.params.userId
        }
    };

    dynamoDb.get(params, (error, result) => {
        if (error) {
            console.log(error);
            res.status(400).json({error: 'Could not get user'});
        }
        else if (result.Item) {
            res.json(result.Item);
        }
        else {
            res.status(404).json({error: 'User not found'});
        }
    });
});

app.post('/user', function(req, res) {
    const {userId, name, email, role} = req.body;

    if (!ROLES.includes(role)) {
        res.status(400).json({error: 'Invalid role value: ' + role});
    }
    else if (isValid({userId, name, email}, res)) {

        const params = {
            TableName: USERS_TABLE,
            Item: {userId, name, email, role}
        };

        dynamoDb.put(params, (error) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not create user'});
            }

            res.json({userId, name, email, role});
        });
    }
});

app.post('/metric', function(req, res) {
    const { metricId, title, category, headline, rationale, data, graphType } = req.body;

    if (isValid({metricId, title, category}, res)) {

        const params = {
            TableName: METRICS_TABLE,
            Item: {metricId, title, category, headline, rationale, data, graphType}
        };

        dynamoDb.put(params, (error) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not create metric'});
            }

            res.json({metricId, title, category, headline, rationale, data, graphType});
        })
    }
});

app.get('/metric/:metricId', function(req, res) {
    const metricId = req.params.metricId;

    if (isValid({metricId}, res)) {

        const params = {
            TableName: METRICS_TABLE,
            Key: {
                metricId: metricId
            }
        };

        dynamoDb.get(params, (error, result) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not get metric'});
            }
            else if (result.Item) {
                res.json(result.Item);
            }
            else {
                res.status(404).json({error: 'Metric not found'});
            }
        });
    }
});

app.get('/metrics', function(req, res) {
    const params = {
        TableName: METRICS_TABLE,
        ProjectionExpression: ['metricId', 'title', 'category']
    };

    dynamoDb.scan(params, (error, result) => {
        if (error) {
            console.log(error);
            res.status(400).json({error: 'Could not get metrics list'});
        }
        else if (result) {
            res.json(result);
        }
        else {
            res.status(404).json({error: 'Metric not found'});
        }
    });
});

app.post('/comment', function(req, res) {
    const { metricId, author, comment, replyComment } = req.body;
    let date = moment().toISOString();

    if (isValid({metricId, author}, res)) {

        const params = {
            TableName: COMMENTS_TABLE,
            Item: {metricId, date, author, comment, votes: 0, blocked: false}
        };

        if (typeof replyComment === 'string' && replyComment.length > 0)
            params.Item.replyComment = replyComment;

        dynamoDb.put(params, (error) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not create comment'});
            }
            else {
                res.json({metricId, date, author, comment, replyComment, votes: 0, blocked: false});
            }
        })
    }
});

app.post('/comment/vote', function(req, res) {
    const { metricId, date, vote } = req.body;

    if(isValid({metricId, date}, res)) {
        dynamoDb.get({TableName: COMMENTS_TABLE, Key: { metricId, date }}, (error, result) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not get votes on comment for metricId: ' + metricId});
            }
            else {
                let votes = result.votes + vote;

                const params = {
                    TableName: COMMENTS_TABLE,
                    Update: {votes},
                    Key: { metricId, date }
                };
// TODO - fix update to increment vote field atomically
                dynamoDb.update(params, (error) => {
                    if (error) {
                        console.log(error);
                        res.status(400).json({error: 'Could not update votes for comment on metricId: ' + metricId});
                    }
                    else {
                        res.json({metricId, date, votes});
                    }
                });
            }
        });
    }
});

app.get('/comments/:metricId', function(req, res) {
    const metricId = req.params.metricId;

    if (isValid({metricId}, res)) {

        const params = {
            TableName: COMMENTS_TABLE,
            Key: {
                metricId: metricId
            }
        };

        dynamoDb.scan(params, (error, result) => {
            if (error) {
                console.log(error);
                res.status(400).json({error: 'Could not get comments'});
            }
            else if (result) {
                res.json(result);
            }
            else {
                res.status(404).json({error: 'Comments not found for metricId ' + metricId});
            }
        });
    }
});

function isValid(obj, res) {
    let isValid = true;
    let errStr = '';
    Object.keys(obj).map(param => {
        let val = obj[param];
        if (typeof val !== 'string' || !val) {
            isValid = false;
            errStr += `${param} must be a string; `;
        }
    });

    if (!isValid) res.status(400).json({error: errStr});
    return isValid;
}

module.exports.handler = serverless(app);