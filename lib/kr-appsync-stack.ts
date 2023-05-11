import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { readFileSync } from "fs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  CfnGraphQLApi,
  CfnGraphQLSchema,
  CfnDataSource,
  CfnResolver,
} from "aws-cdk-lib/aws-appsync";
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from "aws-cdk-lib/aws-cognito";
export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    let domainsTable = dynamodb.Table.fromTableName(this, 'MyTable', 'krDomainsTable');

    const recaptchaSecretValue = this.node.tryGetContext('recaptcha_private_key');

    
/*     const openSearchDomain = 'https://search-bitmap-solutions-4yi3533owyvxnzjky3zet5h5au.us-east-1.es.amazonaws.com';
    const myExistingDomain = opensearch.Domain.fromDomainEndpoint(
      this, 'myExistingDomain', openSearchDomain);  */

    const userPoolArn = this.node.tryGetContext('cognito_user_pool');
    const userPool = cognito.UserPool.fromUserPoolArn(this, 'KrUserPool', userPoolArn);


      const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
        userPool,
      });
  

    const cloudWatchRole = new Role(this, "appSyncCloudWatchLogs", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    cloudWatchRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSAppSyncPushToCloudWatchLogs"
      )
    );

    const dynamoDBRole = new Role(this, "DynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

   const openSearchRole = new Role(this, "OpenSearchDataSourceRole",{
      inlinePolicies: {
        'openSearchPolicy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'es:ESHttpGet',
                'es:ESHttpHead',
              ],
              resources: [
                'arn:aws:es:us-east-1:634522811166:domain/bitmap-solutions',
              ],
            }),
          ],
        })
      },
      assumedBy: new ServicePrincipal("appsync.amazonaws.com")
    })

    dynamoDBRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );

    const recaptchaRole = new iam.Role(this, 'RecaptchaRole', {
      roleName: 'recaptcha-role', // Replace with your desired role name
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'), // Assume role by AppSync service
    });

    const recaptchaPolicy = new iam.Policy(this, 'RecaptchaPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['execute-api:Invoke'],
          effect: iam.Effect.ALLOW,
          resources: ['arn:aws:execute-api:*:*:*/*/POST/https://www.google.com/recaptcha/api/siteverify'], // ReCAPTCHA API endpoint
        }),
      ],
    });

    // Attach the inline policy to the RecaptchaRole
    recaptchaRole.attachInlinePolicy(recaptchaPolicy);




    /* const graphAPI = new CfnGraphQLApi(this, "graphqlApi", {
      name: "kr-reports",
      authenticationType: "API_KEY",
      
      logConfig: {
        fieldLogLevel: "ALL",
        cloudWatchLogsRoleArn: cloudWatchRole.roleArn,
      },
      xrayEnabled: false,
    }); */

    const graphPrivateAPI = new CfnGraphQLApi(this, "graphqlPrivateApi", {
      name: "kr-reports-private",
      authenticationType: "AMAZON_COGNITO_USER_POOLS",
      userPoolConfig: {
        userPoolId: userPool.userPoolId,
        defaultAction: "ALLOW",
        awsRegion: "us-east-1",
      },
      additionalAuthenticationProviders: [
        {
          authenticationType: 'API_KEY',
        }
      ],

      logConfig: {
        fieldLogLevel: "ALL",
        cloudWatchLogsRoleArn: cloudWatchRole.roleArn,
      },
      xrayEnabled: false,
    });

    /* const apiSchema = new CfnGraphQLSchema(this, "GraphqlApiSchema", {
      apiId: graphAPI.attrApiId,
      definition: readFileSync("./lib/graphql/public_schema/schema.graphql").toString(),
    }); */

    const apiPrivateSchema = new CfnGraphQLSchema(this, "GraphqlApiPrivateSchema", {
      apiId: graphPrivateAPI.attrApiId,
      definition: readFileSync("./lib/graphql/schema.graphql").toString(),
    });

    const summary = Table.fromTableName(this,'KrAgentCountersResume1', 'kr-agents-counters-resume1');
    const domainTable = Table.fromTableName(this,'KrDomainTable', 'kr-domain-table');

    /* const openSearchDataSource = new appsync.CfnDataSource(this, 'OpenSearchDataSource', {
      apiId: graphAPI.attrApiId,
      name: 'OpenSearchDataSource',
      type: 'AMAZON_ELASTICSEARCH',
      elasticsearchConfig: {
        awsRegion: myExistingDomain.env.region,
        endpoint: openSearchDomain
      },
      serviceRoleArn: openSearchRole.roleArn
    }); */


    const domainsTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "KrDomainsTableDataSource",
      {
        apiId: graphPrivateAPI.attrApiId,
        name: "KrDomainsTableDataSource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: domainsTable.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );


    const summaryTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "summaryTableDatasource",
      {
        apiId: graphPrivateAPI.attrApiId,
        name: "summaryTableDatasource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: summary.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );

    const reCaptchaDataSource: CfnDataSource = new CfnDataSource(
      this,
      "reCaptchaDataSource",
      {
        apiId: graphPrivateAPI.attrApiId,
        name: "reCaptchaDataSource",
        type: "HTTP",
        httpConfig: {
          endpoint: 'https://www.google.com/recaptcha/api/siteverify'
        }
      }
    );



    /* const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
      this,
      "indicatorPerAreaResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getIndicatorPerArea",
        dataSourceName: openSearchDataSource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.res.vtl"
        ).toString(),
      }
    ); */
   


   /*  const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
      this,
      "indicatorPerAreaResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getIndicatorPerArea",
        dataSourceName: summaryTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.res.vtl"
        ).toString(),
      }
    ); */

    const classificationSummaryResolver: CfnResolver = new CfnResolver(
      this,
      "classificationSummaryResolver",
      {
        apiId: graphPrivateAPI.attrApiId,
        typeName: "Query",
        fieldName: "getClassificationSummary",
        dataSourceName: summaryTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.res.vtl"
        ).toString(),
      }
    );


    const domainNamesResolver: CfnResolver = new CfnResolver(
      this,
      "domainNamesResolver",
      {
        apiId: graphPrivateAPI.attrApiId,
        typeName: "Query",
        fieldName: "getDomainVerification",
        dataSourceName: domainsTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.DomainValidation.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.DomainValidation.res.vtl"
        ).toString(),
      }
    );

    const recaptchaTemplate = readFileSync(
      "./lib/http/mappingTemplates/Invoke.recaptchaValidator.req.vtl", {encoding: 'utf8'})
     const replacedTemplate = recaptchaTemplate.replace('$recaptchaSecretValue',recaptchaSecretValue)

     const recaptchaValidationResolver: CfnResolver = new CfnResolver(
      this,
      "recaptchaValidationResolver",
      {
        
        apiId: graphPrivateAPI.attrApiId,
        typeName: "Mutation",
        fieldName: "validateRecaptcha",
        dataSourceName: reCaptchaDataSource.name,
        requestMappingTemplate: replacedTemplate.toString(),
        responseMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.res.vtl"
        ).toString()
      }, 
    );


    recaptchaValidationResolver.addDependency(apiPrivateSchema);
    classificationSummaryResolver.addDependency(apiPrivateSchema);
    domainNamesResolver.addDependency(apiPrivateSchema);

    new cdk.CfnOutput(this, "appsync id", {
      value: graphPrivateAPI.attrApiId,
    });
    new cdk.CfnOutput(this, "appsync Url", {
      value: graphPrivateAPI.attrGraphQlUrl,
    });

    new cdk.CfnOutput(this, "recaptcha value", {
      value: recaptchaSecretValue,
    });
    
    //indicatorPerAreaResolver.addDependsOn(openSearchDataSource);
    

    /* const handler = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });


    const recaptchaLambdaResolver: CfnResolver = new CfnResolver(
      this,
      "classificationSummaryResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Mutation",
        fieldName: "validateRecaptcha",

        requestMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.req.vtl"
        ).toString(),
        responseMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.res.vtl"
        ).toString(),
      }
    ); */

  }
}
