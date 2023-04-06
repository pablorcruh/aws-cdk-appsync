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

export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


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

    dynamoDBRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );



    const graphAPI = new CfnGraphQLApi(this, "graphqlApi", {
      name: "sample-pipeline",
      authenticationType: "API_KEY",
      
      logConfig: {
        fieldLogLevel: "ALL",
        cloudWatchLogsRoleArn: cloudWatchRole.roleArn,
      },
      xrayEnabled: false,
    });

    const apiSchema = new CfnGraphQLSchema(this, "GraphqlApiSchema", {
      apiId: graphAPI.attrApiId,
      definition: readFileSync("./lib/graphql/schema.graphql").toString(),
    });

    const contacts = Table.fromTableName(this,'KrAgentCountersResume', 'kr-agents-counters-resume');

    const contactsTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "KrAgentCountersResumeTableDataSource",
      {
        apiId: graphAPI.attrApiId,
        name: "KrAgentCountersResumeTableDataSource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: contacts.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );


    const getContactsByCreatorResolver: CfnResolver = new CfnResolver(
      this,
      "getContactsByCreatorResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getData",
        dataSourceName: contactsTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.listContacts.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.listContacts.res.vtl"
        ).toString(),
      }
    );

    const getTestResolver: CfnResolver = new CfnResolver(
      this,
      "getTestResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getTest",
        dataSourceName: contactsTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.Count.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.Count.res.vtl"
        ).toString(),
      }
    );

    getContactsByCreatorResolver.addDependsOn(apiSchema);
    getTestResolver.addDependsOn(apiSchema);

  }
}
