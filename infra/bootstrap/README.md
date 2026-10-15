# Bootstrap: deployer permissions

Terraform in `infra/` needs one IAM policy on the principal that runs it. The policy is scoped to `mansa*` names wherever AWS supports resource-level permissions.

An **admin** runs this once (replace `<user>`):

```bash
aws iam create-policy --policy-name mansamusa-deployer --policy-document file://infra/bootstrap/deployer-policy.json
aws iam attach-user-policy --user-name <user> --policy-arn arn:aws:iam::<account-id>:policy/mansamusa-deployer
```

Then, once per account, enable the Claude models in the Bedrock console (us-east-1 → Model access). Anthropic models ask for a short use-case form the first time.

Check:

```bash
aws bedrock list-inference-profiles --region us-east-1 --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic')].inferenceProfileId"
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1
```

Local development uses the same principal through `AWS_PROFILE`; the deployed wallet uses the role Terraform creates for Vercel OIDC (no static keys).
