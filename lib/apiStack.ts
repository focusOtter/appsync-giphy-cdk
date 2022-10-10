import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as appsync from '@aws-cdk/aws-appsync-alpha'
import * as path from 'path'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'

export class APIStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props)

		//create our API
		const api = new appsync.GraphqlApi(this, 'Api', {
			name: 'apiSecret',
			schema: appsync.Schema.fromAsset(path.join(__dirname, 'schema.graphql')),
			authorizationConfig: {
				defaultAuthorization: {
					authorizationType: appsync.AuthorizationType.API_KEY,
					apiKeyConfig: {
						name: 'getSSMAPIKey',
					},
				},
			},
			logConfig: {
				fieldLogLevel: appsync.FieldLogLevel.ALL,
			},
			xrayEnabled: true,
		})

		// Create our 2 datasources

		// The Giphy API
		const giphyDS = api.addHttpDataSource('toGiphyAPI', 'https://api.giphy.com')

		// Secrets Manager
		const ssmDS = api.addHttpDataSource(
			'toSecretManager',
			'https://secretsmanager.us-east-1.amazonaws.com',
			{
				authorizationConfig: {
					signingRegion: 'us-east-1',
					signingServiceName: 'secretsmanager',
				},
			}
		)

		// policy to permit an http datasource to get a secret in Secrets Manager

		ssmDS.grantPrincipal.addToPrincipalPolicy(
			new PolicyStatement({
				resources: [
					'arn:aws:secretsmanager:us-east-1:521776702104:secret:SecretId-P2Z1pP',
				],
				actions: ['secretsmanager:GetSecretValue'],
			})
		)

		// Create a function that gets the secret
		const appSyncFunction = new appsync.AppsyncFunction(
			this,
			'getSecretFromSSM',
			{
				api,
				dataSource: ssmDS,
				name: 'fetchSecretFromSSM',
				requestMappingTemplate: appsync.MappingTemplate.fromFile(
					path.join(__dirname, 'mappingTemplates/Query.getSecret.req.vtl')
				),
				responseMappingTemplate: appsync.MappingTemplate.fromFile(
					path.join(__dirname, 'mappingTemplates/Query.getSecret.res.vtl')
				),
			}
		)

		// Create a function that will get the Gifs from the API
		const getGifsFunction = new appsync.AppsyncFunction(
			this,
			'getGifsFromGiphy',
			{
				api,
				dataSource: giphyDS,
				name: 'getGifsFromGiphy',
				requestMappingTemplate: appsync.MappingTemplate.fromFile(
					path.join(__dirname, 'mappingTemplates/Query.getGifs.req.vtl')
				),
				responseMappingTemplate: appsync.MappingTemplate.fromFile(
					path.join(__dirname, 'mappingTemplates/Query.getGifs.res.vtl')
				),
			}
		)

		// Create a pipeline that has a "before" and "after" step + our fns
		const myPipelineResolver = new appsync.Resolver(this, 'mySecretPipeline', {
			api,
			typeName: 'Query',
			fieldName: 'getGifs',
			requestMappingTemplate: appsync.MappingTemplate.fromFile(
				path.join(__dirname, 'mappingTemplates/Pipeline.Before.req.vtl')
			),
			pipelineConfig: [appSyncFunction, getGifsFunction],
			responseMappingTemplate: appsync.MappingTemplate.fromFile(
				path.join(__dirname, 'mappingTemplates/Pipeline.After.res.vtl')
			),
		})
	}
}
